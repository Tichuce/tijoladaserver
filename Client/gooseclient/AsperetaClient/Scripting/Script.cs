using System;
using System.IO;
using System.Reflection;
using Microsoft.CodeAnalysis.CSharp.Scripting;
using Microsoft.CodeAnalysis.Scripting;

namespace AsperetaClient;

    public class Script<T> : IScript
    {
        public string FilePath { get; set; }

        public T Object { get; private set; }

        public bool Loaded { get; private set; }

        public Script(string filePath)
        {
            this.FilePath = filePath;

            LoadScript();
        }

        public void LoadScript()
        {
            if (!File.Exists(this.FilePath))
                throw new FileNotFoundException("Couldn't find script " + this.FilePath);

            string scriptContents = File.ReadAllText(this.FilePath);

            try
            {
                var scriptOptions = ScriptOptions.Default
                    .WithReferences(Assembly.GetExecutingAssembly())
                    .WithImports("System", "System.Collections.Generic", "System.Linq", "AsperetaClient", "AsperetaClient.Scripting.GameState");

                var script = CSharpScript.Create(scriptContents, scriptOptions);
                script.Compile();

                var result = script.RunAsync().Result.ReturnValue;
                var scriptType = (Type)result;

                this.Object = (T)Activator.CreateInstance(scriptType);

                Loaded = true;
            }
            catch (Exception e)
            {
                Console.WriteLine($"Exception loading script '{FilePath}': {e}");
                Loaded = false;
            }
        }
    }
