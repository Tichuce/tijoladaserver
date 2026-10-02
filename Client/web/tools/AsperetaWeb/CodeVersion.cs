using System.Text.RegularExpressions;

namespace AsperetaWeb
{
    public static class CodeVersion
    {
        private static readonly Regex HtmlReference = new(@"(\s(?:src|href)="")([^"":?#]+\.(?:js|css))("")", RegexOptions.Compiled);
        private static readonly Regex ModuleImport = new(@"(\bfrom\s*""|\bimport\s*\(\s*""|\bimport\s*"")(\.{1,2}/[^""?]+\.js)("")", RegexOptions.Compiled);
        private static readonly object Gate = new();
        private static string cached = "";
        private static DateTime checkedAt = DateTime.MinValue;

        public static bool Applies(string path, string ext)
            => !path.StartsWith("/assets/", StringComparison.OrdinalIgnoreCase)
               && (ext.Equals(".html", StringComparison.OrdinalIgnoreCase) || ext.Equals(".js", StringComparison.OrdinalIgnoreCase));

        public static string Rewrite(string text, string ext, string version)
        {
            var pattern = ext.Equals(".html", StringComparison.OrdinalIgnoreCase) ? HtmlReference : ModuleImport;
            return pattern.Replace(text, m => m.Groups[1].Value + m.Groups[2].Value + "?v=" + version + m.Groups[3].Value);
        }

        public static string Current(string root)
        {
            lock (Gate)
            {
                if (DateTime.UtcNow - checkedAt < TimeSpan.FromSeconds(2) && cached.Length > 0)
                    return cached;
                long latest = 0;
                foreach (string dir in new[] { root, Path.Combine(root, "js"), Path.Combine(root, "wiki") })
                {
                    if (!Directory.Exists(dir)) continue;
                    foreach (string file in Directory.EnumerateFiles(dir))
                        latest = Math.Max(latest, File.GetLastWriteTimeUtc(file).Ticks);
                }
                cached = latest.ToString("x");
                checkedAt = DateTime.UtcNow;
                return cached;
            }
        }
    }
}
