namespace AsperetaWeb
{
    public static class Program
    {
        public static int Main(string[] args)
        {
            if (args.Length == 0) return Usage();

            string Option(string name, string fallback)
            {
                int i = Array.IndexOf(args, name);
                return i >= 0 && i + 1 < args.Length ? args[i + 1] : fallback;
            }

            try
            {
                switch (args[0].ToLowerInvariant())
                {
                    case "convert":
                        return AssetConverter.Run(Option("--game", "."), Option("--out", "assets"));

                    case "serve":
                        return StaticServer.Run(Option("--root", "www"), int.Parse(Option("--port", "8080")));

                    case "wiki":
                        return WikiExporter.Run(Option("--db", "AsperetaGoose.db"), Option("--out", Path.Combine("www", "wiki", "data.js")),
                            Option("--assets", Path.Combine("www", "assets")), Option("--single", null));

                    default:
                        return Usage();
                }
            }
            catch (Exception e)
            {
                Console.Error.WriteLine(e);
                return 1;
            }
        }

        private static int Usage()
        {
            Console.WriteLine("AsperetaWeb convert --game <Aspereta folder> --out <www/assets>");
            Console.WriteLine("AsperetaWeb serve   --root <www> [--port 8080]");
            Console.WriteLine("AsperetaWeb wiki    --db <AsperetaGoose.db> --out <www/wiki/data.js> [--assets <www/assets>] [--single <aspereta-wiki.html>]");
            return 2;
        }
    }
}
