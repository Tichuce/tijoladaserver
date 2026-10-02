using System.Diagnostics;
using System.Text.Json;
using System.Text.RegularExpressions;
using AsperetaClient;

namespace AsperetaWeb
{
    /**
     * One-time conversion of the Aspereta game folder into files a browser can load on demand.
     *
     *   assets/index.json        frame id -> sheet + rect, animations, compiled.enc
     *   assets/gfx/{file}.png    one PNG per .adf graphic (black/index 0 made transparent)
     *   assets/maps/{n}.bin      "AMAP" v1: u16 width, u16 height, then per tile (row major)
     *                            u8 blocked + 4 x i32 layer frame ids, little endian
     *   assets/skins/{skin}/*    skin .ini files as JSON, skin .bmp files as PNG
     *   assets/game.json         Game.ini as JSON
     *
     * Decoding is done by the desktop client's own AdfFile, CompiledEnc and
     * AsperetaMapLoader, compiled into this tool unchanged.
     */
    public static class AssetConverter
    {
        public static int Run(string gameDir, string outDir)
        {
            gameDir = Path.GetFullPath(gameDir);
            outDir = Path.GetFullPath(outDir);

            if (!Directory.Exists(Path.Combine(gameDir, "data")) || !File.Exists(Path.Combine(gameDir, "data", "compiled.enc")))
            {
                Console.Error.WriteLine($"{gameDir} does not look like the Aspereta game folder (no data/compiled.enc).");
                return 2;
            }

            var sw = Stopwatch.StartNew();
            Directory.CreateDirectory(outDir);

            int errors = 0;
            errors += ConvertGraphics(gameDir, outDir);
            errors += ConvertMaps(gameDir, outDir);
            errors += ConvertSkinsAndSettings(gameDir, outDir);

            Console.WriteLine($"Done in {sw.Elapsed.TotalSeconds:0.0}s with {errors} error(s). Output: {outDir}");
            return errors == 0 ? 0 : 1;
        }

        private static int ConvertGraphics(string gameDir, string outDir)
        {
            string dataDir = Path.Combine(gameDir, "data");
            string gfxDir = Path.Combine(outDir, "gfx");
            Directory.CreateDirectory(gfxDir);

            // Same iteration order and last-wins rule as the client's AdfManager.
            var frames = new SortedDictionary<int, int[]>();
            var animations = new SortedDictionary<int, AnimationData>();
            int converted = 0, skipped = 0, errors = 0;
            long pngBytes = 0;

            foreach (string file in Directory.GetFiles(dataDir, "*.adf"))
            {
                AdfFile adf;
                try
                {
                    adf = new AdfFile(file);
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine($"  {Path.GetFileName(file)}: cannot decode: {e.Message}");
                    errors++;
                    continue;
                }

                foreach (var animation in adf.Animations)
                    animations[animation.Id] = animation;

                if (adf.Type != AdfType.Graphic || !Bmp.IsBmp(adf.FileData))
                {
                    skipped++; // sounds (RIFF/WAV) are not needed by the browser yet
                    continue;
                }

                try
                {
                    var png = Png.Encode(Bmp.Decode(adf.FileData));
                    File.WriteAllBytes(Path.Combine(gfxDir, adf.FileNumber + ".png"), png);
                    pngBytes += png.Length;
                    converted++;
                }
                catch (Exception e)
                {
                    Console.Error.WriteLine($"  {Path.GetFileName(file)}: cannot convert image: {e.Message}");
                    errors++;
                    continue;
                }

                foreach (var frame in adf.Frames)
                    frames[frame.Key] = new[] { adf.FileNumber, frame.Value.X, frame.Value.Y, frame.Value.W, frame.Value.H };
            }

            var compiled = new CompiledEnc(Path.Combine(dataDir, "compiled.enc"));

            string indexPath = Path.Combine(outDir, "index.json");
            using (var stream = File.Create(indexPath))
            using (var json = new Utf8JsonWriter(stream))
            {
                json.WriteStartObject();
                json.WriteNumber("version", 1);
                json.WriteString("generated", DateTime.UtcNow.ToString("o"));

                // frameId: [file, x, y, w, h]
                json.WriteStartObject("frames");
                foreach (var f in frames)
                {
                    json.WriteStartArray(f.Key.ToString());
                    foreach (int v in f.Value) json.WriteNumberValue(v);
                    json.WriteEndArray();
                }
                json.WriteEndObject();

                // animationId: [interval, frame, frame, ...]
                json.WriteStartObject("animations");
                foreach (var a in animations)
                {
                    json.WriteStartArray(a.Key.ToString());
                    json.WriteNumberValue(a.Value.Interval);
                    foreach (int v in a.Value.Frames) json.WriteNumberValue(v);
                    json.WriteEndArray();
                }
                json.WriteEndObject();

                // [type, id, 32 animation ids], type is the client's AnimationType (0 = Body ... 6 = Feet)
                json.WriteStartArray("compiled");
                foreach (var c in compiled.CompiledAnimations)
                {
                    json.WriteStartArray();
                    json.WriteNumberValue((int)c.Type);
                    json.WriteNumberValue(c.Id);
                    foreach (int v in c.AnimationIndexes) json.WriteNumberValue(v);
                    json.WriteEndArray();
                }
                json.WriteEndArray();

                json.WriteEndObject();
            }

            Console.WriteLine($"Graphics: {converted} sheets ({pngBytes / 1024 / 1024.0:0.0} MB PNG), {skipped} non-graphic skipped, " +
                              $"{frames.Count} frames, {animations.Count} animations, {compiled.CompiledAnimations.Count} compiled entries, " +
                              $"index {new FileInfo(indexPath).Length / 1024} KB");
            return errors;
        }

        private static int ConvertMaps(string gameDir, string outDir)
        {
            string mapsOut = Path.Combine(outDir, "maps");
            Directory.CreateDirectory(mapsOut);

            int converted = 0, errors = 0;
            string previous = Directory.GetCurrentDirectory();

            try
            {
                // AsperetaMapLoader reads "maps/Map{n}.map" relative to the game folder, like the client.
                Directory.SetCurrentDirectory(gameDir);

                foreach (string file in Directory.GetFiles(Path.Combine(gameDir, "maps"), "Map*.map"))
                {
                    var match = Regex.Match(Path.GetFileName(file), @"^Map(\d+)\.map$", RegexOptions.IgnoreCase);
                    if (!match.Success) continue;

                    int number = int.Parse(match.Groups[1].Value);
                    try
                    {
                        var map = AsperetaMapLoader.Load(number);

                        using var stream = File.Create(Path.Combine(mapsOut, number + ".bin"));
                        using var writer = new BinaryWriter(stream);
                        writer.Write((byte)'A'); writer.Write((byte)'M'); writer.Write((byte)'A'); writer.Write((byte)'P');
                        writer.Write((ushort)1);
                        writer.Write((ushort)map.Width);
                        writer.Write((ushort)map.Height);

                        for (int y = 0; y < map.Height; y++)
                        {
                            for (int x = 0; x < map.Width; x++)
                            {
                                var tile = map[x, y];
                                writer.Write((byte)(tile.Blocked ? 1 : 0));
                                for (int l = 0; l < 4; l++) writer.Write(tile.Layers[l]);
                            }
                        }

                        converted++;
                    }
                    catch (Exception e)
                    {
                        Console.Error.WriteLine($"  {Path.GetFileName(file)}: {e.Message}");
                        errors++;
                    }
                }
            }
            finally
            {
                Directory.SetCurrentDirectory(previous);
            }

            Console.WriteLine($"Maps: {converted} converted");
            return errors;
        }

        private static int ConvertSkinsAndSettings(string gameDir, string outDir)
        {
            int errors = 0, files = 0;

            string gameIni = Path.Combine(gameDir, "Game.ini");
            if (File.Exists(gameIni))
                errors += WriteIniJson(gameIni, Path.Combine(outDir, "game.json")) ? 0 : 1;

            string skinsDir = Path.Combine(gameDir, "skins");
            if (Directory.Exists(skinsDir))
            {
                foreach (string skin in Directory.GetDirectories(skinsDir))
                {
                    string skinOut = Path.Combine(outDir, "skins", Path.GetFileName(skin));
                    Directory.CreateDirectory(skinOut);

                    foreach (string file in Directory.GetFiles(skin))
                    {
                        string ext = Path.GetExtension(file).ToLowerInvariant();
                        string name = Path.GetFileNameWithoutExtension(file);

                        if (ext == ".ini")
                        {
                            errors += WriteIniJson(file, Path.Combine(skinOut, name + ".json")) ? 0 : 1;
                            files++;
                        }
                        else if (ext == ".bmp")
                        {
                            try
                            {
                                var png = Png.Encode(Bmp.Decode(File.ReadAllBytes(file)));
                                File.WriteAllBytes(Path.Combine(skinOut, name + ".png"), png);
                                files++;
                            }
                            catch (Exception e)
                            {
                                Console.Error.WriteLine($"  skin {Path.GetFileName(skin)}/{Path.GetFileName(file)}: {e.Message}");
                                errors++;
                            }
                        }
                    }
                }
            }

            Console.WriteLine($"Skins/settings: {files} files");
            return errors;
        }

        private static bool WriteIniJson(string iniPath, string jsonPath)
        {
            try
            {
                var ini = new IniFile(iniPath);
                File.WriteAllText(jsonPath, JsonSerializer.Serialize(ini.Sections, new JsonSerializerOptions { WriteIndented = true }));
                return true;
            }
            catch (Exception e)
            {
                Console.Error.WriteLine($"  {iniPath}: {e.Message}");
                return false;
            }
        }
    }
}
