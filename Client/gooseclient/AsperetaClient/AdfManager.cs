using System;
using System.Collections.Generic;
using System.IO;

namespace AsperetaClient
{
    public class AdfManager
    {
        public CompiledEnc CompiledEnc { get; set; }

        public Dictionary<int, AdfFile> Files { get; set; }

        public Dictionary<int, AdfFile> FrameToFile { get; set; }

        public Dictionary<int, AnimationData> Animations { get; set; }

        public AdfManager(string dataPath)
        {
            this.Files = new Dictionary<int, AdfFile>();
            this.FrameToFile = new Dictionary<int, AdfFile>();
            this.Animations = new Dictionary<int, AnimationData>();

            this.Load(dataPath);
        }

        private void Load(string dataPath)
        {
            foreach (string file in Directory.GetFiles(dataPath, "*.adf"))
            {
                var adfFile = new AdfFile(file);
                this.Files.Add(adfFile.FileNumber, adfFile);

                foreach (var frame in adfFile.Frames)
                {
                    this.FrameToFile[frame.Key] = adfFile;
                }

                foreach (var animation in adfFile.Animations)
                {
                    this.Animations[animation.Id] = animation;
                }
            }

            this.CompiledEnc = new CompiledEnc(dataPath + "/compiled.enc");
        }
    }
}
