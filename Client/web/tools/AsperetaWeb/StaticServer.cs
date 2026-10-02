using System.Collections.Concurrent;
using System.IO.Compression;
using System.Net;

namespace AsperetaWeb
{
    /**
     * Serves the browser client (www/) on http://localhost:{port}/ for local testing.
     *
     * Static files, plus WebSocket connections on /ws passed through to the game server's
     * WebSocket listener. Text and binary data files are gzip-compressed once and cached.
     */
    public static class StaticServer
    {
        private static readonly Dictionary<string, string> ContentTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            [".html"] = "text/html; charset=utf-8",
            [".js"] = "text/javascript; charset=utf-8",
            [".css"] = "text/css; charset=utf-8",
            [".json"] = "application/json; charset=utf-8",
            [".png"] = "image/png",
            [".bin"] = "application/octet-stream",
            [".ico"] = "image/x-icon",
            [".map"] = "application/json; charset=utf-8",
        };

        private static readonly HashSet<string> Compressible = new(StringComparer.OrdinalIgnoreCase)
        {
            ".html", ".js", ".css", ".json", ".bin", ".map"
        };

        private static readonly ConcurrentDictionary<string, (DateTime Stamp, string Version, byte[] Gzip)> gzipCache = new();

        public static int Run(string root, int port, Uri gameServer)
        {
            root = Path.GetFullPath(root);
            if (!File.Exists(Path.Combine(root, "index.html")))
            {
                Console.Error.WriteLine($"{root} has no index.html.");
                return 2;
            }

            var listener = new HttpListener();
            // "localhost" is the one prefix Windows lets a normal (non-admin) user listen on.
            listener.Prefixes.Add($"http://localhost:{port}/");
            listener.Start();

            Console.WriteLine($"Serving {root}");
            Console.WriteLine($"Open http://localhost:{port}/ in your browser. Ctrl+C to stop.");
            Console.WriteLine($"Game connections on {WebSocketForwarder.GamePath} go to {gameServer}");

            if (!Directory.Exists(Path.Combine(root, "assets")))
                Console.WriteLine("WARNING: www/assets is missing. Run convert-assets.bat first.");

            while (listener.IsListening)
            {
                HttpListenerContext context;
                try
                {
                    context = listener.GetContext();
                }
                catch (HttpListenerException)
                {
                    break;
                }

                if (WebSocketForwarder.IsGameConnection(context.Request))
                    _ = WebSocketForwarder.ForwardAsync(context, gameServer);
                else
                    ThreadPool.QueueUserWorkItem(_ => Handle(context, root));
            }

            return 0;
        }

        private static void Handle(HttpListenerContext context, string root)
        {
            var response = context.Response;
            try
            {
                string path = Uri.UnescapeDataString(context.Request.Url!.AbsolutePath);
                if (path.EndsWith('/')) path += "index.html";

                string full = Path.GetFullPath(Path.Combine(root, path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar)));
                if (!full.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(full))
                {
                    response.StatusCode = 404;
                    response.Close();
                    return;
                }

                string ext = Path.GetExtension(full);
                response.ContentType = ContentTypes.TryGetValue(ext, out var type) ? type : "application/octet-stream";

                // Code changes every build; converted assets do not.
                bool isAsset = path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase);
                response.Headers["Cache-Control"] = isAsset ? "public, max-age=3600" : "no-cache";

                byte[] body;
                string version = CodeVersion.Applies(path, ext) ? CodeVersion.Current(root) : null;
                string acceptEncoding = context.Request.Headers["Accept-Encoding"] ?? "";
                if (Compressible.Contains(ext) && acceptEncoding.Contains("gzip", StringComparison.OrdinalIgnoreCase))
                {
                    body = GetGzip(full, ext, version);
                    response.Headers["Content-Encoding"] = "gzip";
                }
                else
                {
                    body = version is null ? File.ReadAllBytes(full) : Rewritten(full, ext, version);
                }

                response.ContentLength64 = body.Length;
                if (context.Request.HttpMethod != "HEAD")
                    response.OutputStream.Write(body, 0, body.Length);
                response.Close();
            }
            catch (Exception e)
            {
                Console.Error.WriteLine($"{context.Request.Url}: {e.Message}");
                try { response.Abort(); } catch { }
            }
        }

        private static byte[] GetGzip(string file, string ext, string version)
        {
            var stamp = File.GetLastWriteTimeUtc(file);
            if (gzipCache.TryGetValue(file, out var cached) && cached.Stamp == stamp && cached.Version == version)
                return cached.Gzip;

            var result = Gzip(version is null ? File.ReadAllBytes(file) : Rewritten(file, ext, version));
            gzipCache[file] = (stamp, version, result);
            return result;
        }

        private static byte[] Rewritten(string file, string ext, string version)
            => System.Text.Encoding.UTF8.GetBytes(CodeVersion.Rewrite(File.ReadAllText(file), ext, version));

        private static byte[] Gzip(byte[] raw)
        {
            using var ms = new MemoryStream();
            using (var gz = new GZipStream(ms, CompressionLevel.Optimal, leaveOpen: true))
                gz.Write(raw, 0, raw.Length);
            return ms.ToArray();
        }
    }
}
