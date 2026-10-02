using System.Net;
using System.Net.WebSockets;

namespace AsperetaWeb
{
    public static class WebSocketForwarder
    {
        public const string GamePath = "/ws";

        public static bool IsGameConnection(HttpListenerRequest request)
            => request.IsWebSocketRequest && string.Equals(request.Url!.AbsolutePath, GamePath, StringComparison.Ordinal);

        public static async Task ForwardAsync(HttpListenerContext context, Uri gameServer)
        {
            var upstream = new ClientWebSocket();
            upstream.Options.KeepAliveInterval = TimeSpan.Zero;
            upstream.Options.CollectHttpResponseDetails = true;
            string origin = context.Request.Headers["Origin"];
            if (!string.IsNullOrEmpty(origin))
                upstream.Options.SetRequestHeader("Origin", origin);
            upstream.Options.SetRequestHeader("X-Forwarded-For", ForwardedFor(context.Request));

            try
            {
                await upstream.ConnectAsync(gameServer, CancellationToken.None);
            }
            catch (Exception e)
            {
                int status = upstream.HttpStatusCode == HttpStatusCode.Forbidden ? 403 : 502;
                Console.Error.WriteLine($"Game connection to {gameServer} failed ({status}): {e.Message}");
                upstream.Dispose();
                try
                {
                    context.Response.StatusCode = status;
                    context.Response.Close();
                }
                catch
                {
                }
                return;
            }

            WebSocket browser;
            try
            {
                browser = (await context.AcceptWebSocketAsync(null, TimeSpan.FromSeconds(30))).WebSocket;
            }
            catch (Exception e)
            {
                Console.Error.WriteLine($"WebSocket accept failed: {e.Message}");
                upstream.Abort();
                upstream.Dispose();
                return;
            }

            await Task.WhenAny(Pump(browser, upstream), Pump(upstream, browser));
            await CloseQuietly(browser);
            await CloseQuietly(upstream);
            browser.Dispose();
            upstream.Dispose();
        }

        public static string ForwardedFor(HttpListenerRequest request)
        {
            string peer = request.RemoteEndPoint.Address.ToString();
            string incoming = request.Headers["X-Forwarded-For"];
            if (string.IsNullOrWhiteSpace(incoming))
                return peer;
            // The listener only accepts localhost, so a forwarded header can only come from the local tunnel.
            return IPAddress.IsLoopback(request.RemoteEndPoint.Address) ? incoming : incoming + ", " + peer;
        }

        private static async Task Pump(WebSocket from, WebSocket to)
        {
            var buffer = new byte[16 * 1024];
            try
            {
                while (from.State == WebSocketState.Open && to.State == WebSocketState.Open)
                {
                    var result = await from.ReceiveAsync(new ArraySegment<byte>(buffer), CancellationToken.None);
                    if (result.MessageType == WebSocketMessageType.Close)
                        return;
                    await to.SendAsync(new ArraySegment<byte>(buffer, 0, result.Count), result.MessageType, result.EndOfMessage, CancellationToken.None);
                }
            }
            catch (WebSocketException)
            {
            }
            catch (ObjectDisposedException)
            {
            }
        }

        private static async Task CloseQuietly(WebSocket socket)
        {
            try
            {
                if (socket.State is WebSocketState.Open or WebSocketState.CloseReceived)
                {
                    using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                    await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, null, timeout.Token);
                }
            }
            catch
            {
                socket.Abort();
            }
        }
    }
}
