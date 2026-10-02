using System.Net.Sockets;
using System.Text;

namespace Goose.Tests;

public class WebSocketTransportTests
{
    private static byte[] Handshake(string key = "dGhlIHNhbXBsZSBub25jZQ==") => Encoding.ASCII.GetBytes(
        "GET / HTTP/1.1\r\nHost: localhost:2007\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
        "Origin: http://localhost:8080\r\nSec-WebSocket-Key: " + key + "\r\nSec-WebSocket-Version: 13\r\n\r\n");

    private static byte[] ClientFrame(byte opcode, byte[] payload, bool fin = true)
    {
        byte[] mask = { 0x37, 0xfa, 0x21, 0x3d };
        var frame = new List<byte> { (byte)((fin ? 0x80 : 0) | opcode) };

        if (payload.Length < 126)
        {
            frame.Add((byte)(0x80 | payload.Length));
        }
        else
        {
            frame.Add(0x80 | 126);
            frame.Add((byte)(payload.Length >> 8));
            frame.Add((byte)payload.Length);
        }

        frame.AddRange(mask);
        for (int i = 0; i < payload.Length; i++) frame.Add((byte)(payload[i] ^ mask[i & 3]));
        return frame.ToArray();
    }

    private static WebSocketConnection.FeedResult Feed(WebSocketConnection c, byte[] bytes) => c.Feed(bytes, bytes.Length);

    [Fact]
    public void AcceptKeyMatchesRfc6455Example()
    {
        Assert.Equal("s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", WebSocketConnection.AcceptKey("dGhlIHNhbXBsZSBub25jZQ=="));
    }

    [Fact]
    public void HandshakeCompletesAndAnswersWith101()
    {
        var c = new WebSocketConnection();
        var result = Feed(c, Handshake());

        Assert.True(result.HandshakeCompleted);
        Assert.False(result.Closed);
        Assert.True(c.Open);
        Assert.Equal("http://localhost:8080", c.Origin);

        string response = Encoding.ASCII.GetString(result.Response!);
        Assert.StartsWith("HTTP/1.1 101 Switching Protocols\r\n", response);
        Assert.Contains("Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=\r\n", response);
    }

    [Fact]
    public void HandshakeSplitAcrossReadsWaitsForTheBlankLine()
    {
        var c = new WebSocketConnection();
        var bytes = Handshake();

        var first = c.Feed(bytes, 20);
        Assert.False(first.HandshakeCompleted);
        Assert.Null(first.Response);

        var rest = bytes.Skip(20).ToArray();
        Assert.True(Feed(c, rest).HandshakeCompleted);
    }

    [Fact]
    public void PlainHttpRequestIsRefused()
    {
        var c = new WebSocketConnection();
        var result = Feed(c, Encoding.ASCII.GetBytes("GET / HTTP/1.1\r\nHost: localhost\r\n\r\n"));

        Assert.True(result.Closed);
        Assert.False(c.Open);
        Assert.StartsWith("HTTP/1.1 400", Encoding.ASCII.GetString(result.Response!));
    }

    [Fact]
    public void MaskedTextFrameDecodesToProtocolText()
    {
        var c = new WebSocketConnection();
        Feed(c, Handshake());

        var result = Feed(c, ClientFrame(WebSocketConnection.OpText, Encoding.ASCII.GetBytes("M2\x1;hello\x1")));

        Assert.Equal(new[] { "M2\x1;hello\x1" }, result.Messages);
    }

    [Fact]
    public void Rfc6455MaskedHelloExample()
    {
        var c = new WebSocketConnection();
        Feed(c, Handshake());

        byte[] frame = { 0x81, 0x85, 0x37, 0xfa, 0x21, 0x3d, 0x7f, 0x9f, 0x4d, 0x51, 0x58 };
        Assert.Equal(new[] { "Hello" }, Feed(c, frame).Messages);
    }

    [Fact]
    public void FramesSplitAcrossReadsAndBatchedInOneReadBothWork()
    {
        var c = new WebSocketConnection();
        Feed(c, Handshake());

        var a = ClientFrame(WebSocketConnection.OpText, Encoding.ASCII.GetBytes("LOGINa,b,GooseClient\x1"));
        var b = ClientFrame(WebSocketConnection.OpText, Encoding.ASCII.GetBytes(new string('x', 300) + "\x1"));
        var all = a.Concat(b).ToArray();

        var messages = new List<string>();
        foreach (var chunk in all.Chunk(7))
            messages.AddRange(Feed(c, chunk).Messages);

        Assert.Equal(2, messages.Count);
        Assert.Equal("LOGINa,b,GooseClient\x1", messages[0]);
        Assert.Equal(301, messages[1].Length);
    }

    [Fact]
    public void FragmentedMessageIsJoined()
    {
        var c = new WebSocketConnection();
        Feed(c, Handshake());

        var result = Feed(c, ClientFrame(WebSocketConnection.OpText, Encoding.ASCII.GetBytes("ab"), fin: false)
            .Concat(ClientFrame(WebSocketConnection.OpContinuation, Encoding.ASCII.GetBytes("cd"))).ToArray());

        Assert.Equal(new[] { "abcd" }, result.Messages);
    }

    [Fact]
    public void NonAsciiBecomesQuestionMarkLikeTheTcpPath()
    {
        var c = new WebSocketConnection();
        Feed(c, Handshake());

        var result = Feed(c, ClientFrame(WebSocketConnection.OpText, Encoding.UTF8.GetBytes(";olá\x1")));

        Assert.Equal(new[] { ";ol?\x1" }, result.Messages);
    }

    [Fact]
    public void CloseFrameAndUnmaskedFrameCloseTheConnection()
    {
        var c = new WebSocketConnection();
        Feed(c, Handshake());
        Assert.True(Feed(c, ClientFrame(WebSocketConnection.OpClose, Array.Empty<byte>())).Closed);

        var d = new WebSocketConnection();
        Feed(d, Handshake());
        Assert.True(Feed(d, new byte[] { 0x81, 0x02, (byte)'h', (byte)'i' }).Closed);
    }

    [Theory]
    [InlineData(5)]
    [InlineData(125)]
    [InlineData(126)]
    [InlineData(65535)]
    [InlineData(70000)]
    public void EncodeFrameUsesTheRightLengthForm(int length)
    {
        var payload = Enumerable.Repeat((byte)'a', length).ToArray();
        var frame = WebSocketConnection.EncodeFrame(WebSocketConnection.OpText, payload);

        Assert.Equal(0x81, frame[0]);

        int header;
        long decoded;
        if (frame[1] < 126) { header = 2; decoded = frame[1]; }
        else if (frame[1] == 126) { header = 4; decoded = (frame[2] << 8) | frame[3]; }
        else { header = 10; decoded = 0; for (int i = 2; i < 10; i++) decoded = (decoded << 8) | frame[i]; }

        Assert.Equal(length, decoded);
        Assert.Equal(header + length, frame.Length);
    }

    [Fact]
    public void WrapLeavesTcpSocketsAloneAndFramesOpenWebSockets()
    {
        using var tcp = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        using var ws = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        var bytes = Encoding.ASCII.GetBytes("SUP10,10\x1");

        try
        {
            Assert.Same(bytes, WebSocketTransport.Wrap(tcp, bytes));

            var connection = WebSocketTransport.Register(ws);
            Assert.Empty(WebSocketTransport.Wrap(ws, bytes)); // before the handshake nothing may be sent

            Feed(connection, Handshake());
            var framed = WebSocketTransport.Wrap(ws, bytes);
            Assert.Equal(new byte[] { 0x81, (byte)bytes.Length }, framed.Take(2).ToArray());
            Assert.Equal(bytes, framed.Skip(2).ToArray());
        }
        finally
        {
            WebSocketTransport.Remove(ws);
        }
    }

    [Fact]
    public void WebSocketListenerIsOffWhenPortIsZero()
    {
        var server = new GameServer(new GooseSettings { WebSocketPort = 0 });
        Assert.Null(server.CreateWebSocketListenSocket());
    }

    [Fact]
    public void WebSocketListenerPortInUseDoesNotStopTheServer()
    {
        using var blocker = new Socket(AddressFamily.InterNetwork, SocketType.Stream, ProtocolType.Tcp);
        blocker.Bind(new System.Net.IPEndPoint(System.Net.IPAddress.Loopback, 0));
        blocker.Listen(10);
        int port = ((System.Net.IPEndPoint)blocker.LocalEndPoint!).Port;

        var server = new GameServer(new GooseSettings { WebSocketIP = "127.0.0.1", WebSocketPort = port });
        Assert.Null(server.CreateWebSocketListenSocket());
    }

    [Fact]
    public void WebSocketDefaultsAreLocalOnly()
    {
        var settings = new GooseSettings();
        Assert.Equal("127.0.0.1", settings.WebSocketIP);
        Assert.Equal(2007, settings.WebSocketPort);
    }
}
