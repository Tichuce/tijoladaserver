using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;

namespace Goose
{
    /**
     * WebSocketTransport, lets browser clients speak the existing game protocol
     *
     * Browser connections are accepted on a second listen socket (WebSocketIP:WebSocketPort)
     * and are ordinary Sockets everywhere else in the server, so PlayerHandler, LoginEvent,
     * the per-IP connection limits and the logs all see the browser's real address.
     *
     * This class only translates bytes. Inbound frames are unwrapped into exactly the text a
     * TCP client would have sent (packets delimited by \x1) and handed to GameWorld.Received.
     * Outbound protocol bytes are wrapped into a frame right before they reach the socket, so
     * Player's send buffer only ever holds whole frames and partial sends keep the stream valid.
     * There is no game logic here.
     *
     */
    public static class WebSocketTransport
    {
        private static readonly ConcurrentDictionary<Socket, WebSocketConnection> connections = new();

        internal static WebSocketConnection Register(Socket sock, IReadOnlyCollection<string>? allowedOrigins = null)
        {
            var connection = new WebSocketConnection(allowedOrigins);
            connections[sock] = connection;
            return connection;
        }

        internal static bool TryGet(Socket sock, out WebSocketConnection connection)
            => connections.TryGetValue(sock, out connection!);

        internal static void Remove(Socket sock) => connections.TryRemove(sock, out _);

        internal static void Clear() => connections.Clear();

        public static bool IsWebSocket(Socket? sock) => sock is not null && connections.ContainsKey(sock);

        /**
         * Wrap, frames outgoing protocol bytes for a WebSocket connection
         *
         * TCP sockets get their bytes back untouched. A WebSocket that has not finished its
         * handshake gets nothing: the game never sends before the handshake (NewConnection is
         * only raised once it completes), and raw bytes there would corrupt the upgrade.
         *
         */
        public static byte[] Wrap(Socket? sock, byte[] payload)
        {
            if (sock is null || !connections.TryGetValue(sock, out var connection))
                return payload;

            if (!connection.Open)
                return Array.Empty<byte>();

            return WebSocketConnection.EncodeFrame(WebSocketConnection.OpText, payload);
        }
    }

    internal sealed class WebSocketConnection
    {
        public const byte OpContinuation = 0x0;
        public const byte OpText = 0x1;
        public const byte OpBinary = 0x2;
        public const byte OpClose = 0x8;
        public const byte OpPing = 0x9;
        public const byte OpPong = 0xA;

        public const int MaxHandshakeBytes = 8192;

        /**
         * Largest message we accept from a browser. Game packets are tiny; this only exists so a
         * bad client cannot make us buffer without limit (GameWorld has its own limits as well).
         */
        public const int MaxMessageBytes = 64 * 1024;

        private const string HandshakeGuid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

        private readonly List<byte> pending = new();
        private readonly List<byte> message = new();

        private readonly IReadOnlyCollection<string> allowedOrigins;

        public WebSocketConnection(IReadOnlyCollection<string>? allowedOrigins = null)
        {
            this.allowedOrigins = allowedOrigins ?? Array.Empty<string>();
        }

        public bool Open { get; private set; }

        public string? Origin { get; private set; }

        public string? ForwardedFor { get; private set; }
        public string? RealIP { get; private set; }

        public sealed class FeedResult
        {
            /** Bytes to write to the socket (the HTTP upgrade response or a refusal). */
            public byte[]? Response;

            /** True the moment the upgrade completes; the caller raises NewConnection then. */
            public bool HandshakeCompleted;

            /** The peer closed, broke the protocol or was refused; the caller drops the socket. */
            public bool Closed;

            /** Complete text messages, already in the server's ASCII view of the protocol. */
            public readonly List<string> Messages = new();
        }

        public FeedResult Feed(byte[] buffer, int count)
        {
            var result = new FeedResult();

            for (int i = 0; i < count; i++) this.pending.Add(buffer[i]);

            if (!this.Open)
            {
                this.ReadHandshake(result);
                if (!this.Open || result.Closed) return result;
            }

            this.ReadFrames(result);
            return result;
        }

        private void ReadHandshake(FeedResult result)
        {
            int end = IndexOfHeaderEnd(this.pending);
            if (end < 0)
            {
                if (this.pending.Count > MaxHandshakeBytes) result.Closed = true;
                return;
            }

            string request = Encoding.ASCII.GetString(this.pending.GetRange(0, end).ToArray());
            this.pending.RemoveRange(0, end + 4);

            string? key = null;
            bool upgrade = false;

            foreach (string line in request.Split("\r\n"))
            {
                int colon = line.IndexOf(':');
                if (colon <= 0) continue;

                string name = line.Substring(0, colon).Trim();
                string value = line.Substring(colon + 1).Trim();

                if (name.Equals("Sec-WebSocket-Key", StringComparison.OrdinalIgnoreCase))
                    key = value;
                else if (name.Equals("Upgrade", StringComparison.OrdinalIgnoreCase))
                    upgrade = value.Equals("websocket", StringComparison.OrdinalIgnoreCase);
                else if (name.Equals("Origin", StringComparison.OrdinalIgnoreCase))
                    this.Origin = value;
                else if (name.Equals("X-Forwarded-For", StringComparison.OrdinalIgnoreCase))
                    this.ForwardedFor = this.ForwardedFor is null ? value : this.ForwardedFor + ", " + value;
                else if (name.Equals("X-Real-IP", StringComparison.OrdinalIgnoreCase))
                    this.RealIP = value;
            }

            if (!request.StartsWith("GET ", StringComparison.Ordinal) || !upgrade || string.IsNullOrEmpty(key))
            {
                const string body = "This port only accepts WebSocket game connections.";
                result.Response = Encoding.ASCII.GetBytes(
                    "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nConnection: close\r\nContent-Length: " +
                    body.Length + "\r\n\r\n" + body);
                result.Closed = true;
                return;
            }

            if (!this.OriginAllowed())
            {
                const string body = "This game server does not accept connections from this website.";
                result.Response = Encoding.ASCII.GetBytes(
                    "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nConnection: close\r\nContent-Length: " +
                    body.Length + "\r\n\r\n" + body);
                result.Closed = true;
                return;
            }

            result.Response = Encoding.ASCII.GetBytes(
                "HTTP/1.1 101 Switching Protocols\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Accept: " + AcceptKey(key) + "\r\n\r\n");
            result.HandshakeCompleted = true;
            this.Open = true;
        }

        internal bool OriginAllowed()
        {
            if (this.allowedOrigins.Count == 0) return true;
            if (string.IsNullOrWhiteSpace(this.Origin)) return false;
            string origin = this.Origin.Trim().TrimEnd('/');
            return this.allowedOrigins.Any(o => string.Equals(o?.Trim().TrimEnd('/'), origin, StringComparison.OrdinalIgnoreCase));
        }

        internal string ClientAddress(string socketAddress, IReadOnlyCollection<string> trustedProxies)
        {
            if (!IsTrusted(socketAddress, trustedProxies)) return socketAddress;

            string? candidate = null;
            if (!string.IsNullOrWhiteSpace(this.ForwardedFor))
                // Only the last entry was added by the proxy; earlier ones come from the browser.
                candidate = this.ForwardedFor.Split(',').Select(s => s.Trim()).LastOrDefault(s => s.Length > 0);
            if (string.IsNullOrEmpty(candidate))
                candidate = this.RealIP?.Trim();

            return Normalize(candidate) ?? socketAddress;
        }

        private static bool IsTrusted(string socketAddress, IReadOnlyCollection<string> trustedProxies)
        {
            string? socket = Normalize(socketAddress);
            return socket is not null && trustedProxies.Any(p => Normalize(p) == socket);
        }

        internal static string? Normalize(string? address)
        {
            if (string.IsNullOrWhiteSpace(address) || !IPAddress.TryParse(address.Trim(), out var ip)) return null;
            if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4();
            return ip.ToString();
        }

        private void ReadFrames(FeedResult result)
        {
            while (this.pending.Count >= 2)
            {
                byte b0 = this.pending[0];
                byte b1 = this.pending[1];

                bool fin = (b0 & 0x80) != 0;
                byte opcode = (byte)(b0 & 0x0F);
                bool masked = (b1 & 0x80) != 0;
                long length = b1 & 0x7F;
                int header = 2;

                if (length == 126)
                {
                    if (this.pending.Count < 4) return;
                    length = (this.pending[2] << 8) | this.pending[3];
                    header = 4;
                }
                else if (length == 127)
                {
                    if (this.pending.Count < 10) return;
                    length = 0;
                    for (int i = 2; i < 10; i++) length = (length << 8) | this.pending[i];
                    header = 10;
                }

                // RFC 6455 5.1: every client frame is masked. Anything else is not a browser.
                if (!masked || length < 0 || length > MaxMessageBytes)
                {
                    result.Closed = true;
                    return;
                }

                int total = header + 4 + (int)length;
                if (this.pending.Count < total) return;

                var payload = new byte[length];
                for (int i = 0; i < length; i++)
                    payload[i] = (byte)(this.pending[header + 4 + i] ^ this.pending[header + (i & 3)]);

                this.pending.RemoveRange(0, total);

                switch (opcode)
                {
                    case OpContinuation:
                    case OpText:
                    case OpBinary:
                        this.message.AddRange(payload);
                        if (this.message.Count > MaxMessageBytes)
                        {
                            result.Closed = true;
                            return;
                        }
                        if (fin)
                        {
                            result.Messages.Add(ToProtocolText(this.message.ToArray()));
                            this.message.Clear();
                        }
                        break;

                    case OpClose:
                        result.Closed = true;
                        return;

                    case OpPing:
                    case OpPong:
                        // Browsers never send pings; the game has its own PING/PONG packets.
                        break;

                    default:
                        result.Closed = true;
                        return;
                }
            }
        }

        /**
         * The TCP path decodes with Encoding.ASCII, which turns every byte above 127 into '?'.
         * Browsers send UTF-8, so decode that and apply the same rule per character, which keeps
         * the server seeing exactly the character set it always has.
         */
        internal static string ToProtocolText(byte[] payload)
        {
            string text = Encoding.UTF8.GetString(payload);

            bool clean = true;
            foreach (char c in text)
            {
                if (c > 127) { clean = false; break; }
            }
            if (clean) return text;

            var sb = new StringBuilder(text.Length);
            foreach (char c in text) sb.Append(c > 127 ? '?' : c);
            return sb.ToString();
        }

        internal static string AcceptKey(string key)
        {
            byte[] hash = SHA1.HashData(Encoding.ASCII.GetBytes(key + HandshakeGuid));
            return Convert.ToBase64String(hash);
        }

        /** Server frames are never masked (RFC 6455 5.1). */
        internal static byte[] EncodeFrame(byte opcode, byte[] payload)
        {
            int length = payload.Length;
            int header = length < 126 ? 2 : length <= ushort.MaxValue ? 4 : 10;
            var frame = new byte[header + length];

            frame[0] = (byte)(0x80 | opcode);

            if (length < 126)
            {
                frame[1] = (byte)length;
            }
            else if (length <= ushort.MaxValue)
            {
                frame[1] = 126;
                frame[2] = (byte)(length >> 8);
                frame[3] = (byte)length;
            }
            else
            {
                frame[1] = 127;
                long l = length;
                for (int i = 9; i >= 2; i--)
                {
                    frame[i] = (byte)l;
                    l >>= 8;
                }
            }

            Buffer.BlockCopy(payload, 0, frame, header, length);
            return frame;
        }

        private static int IndexOfHeaderEnd(List<byte> bytes)
        {
            for (int i = 0; i + 3 < bytes.Count; i++)
            {
                if (bytes[i] == '\r' && bytes[i + 1] == '\n' && bytes[i + 2] == '\r' && bytes[i + 3] == '\n')
                    return i;
            }
            return -1;
        }
    }
}
