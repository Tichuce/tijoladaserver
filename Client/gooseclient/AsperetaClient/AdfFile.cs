using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace AsperetaClient
{
    public enum AdfType
    {
        Graphic = 1,
        Sound = 2,
    }

    public class AnimationData
    {
        public int Id { get; set; }

        public int Interval { get; set; }

        public List<int> Frames { get; set; } = new List<int>();
    }

    public class Frame
    {
        public int Index { get; private set; }
        public int X { get; private set; }
        public int Y { get; private set; }
        public int W { get; private set; }
        public int H { get; private set; }

        public Frame(int index, int x, int y, int w, int h)
        {
            this.Index = index;
            this.X = x;
            this.Y = y;
            this.W = w;
            this.H = h;
        }
    }

    public class AdfFile
    {
        public int FileNumber { get; private set; }
        public AdfType Type { get; private set; }
        public int FirstFrameIndex { get; private set; }
        public int FrameCount { get; private set; }
        public Dictionary<int, Frame> Frames { get; private set; } = new Dictionary<int, Frame>();

        public List<AnimationData> Animations { get; private set; } = new List<AnimationData>();

        public byte[] FileData { get; private set; }

        public AdfFile(string file)
        {
            byte[] bytes = File.ReadAllBytes(file);

            using (var reader = new BinaryReader(new MemoryStream(bytes)))
            {
                this.Type = (AdfType)Convert.ToInt32(reader.ReadByte());

                // so the last byte happens to be twice the "offset" number.
                // but that doesn't matter because the second to last byte is *always?* the offset number anyways!
                byte offset = bytes[bytes.Length - 2];

                int extraLength = reader.ReadInt32();

                // extra bytes
                for (int i = 0; i < extraLength; i++) reader.ReadByte();

                // If this byte is non-zero we need to offset the offset with the difference between 100 and the number of frames.
                byte offset2 = ApplyOffsetByte(reader.ReadByte(), offset);

                offset = ApplyOffsetByte(offset, 0 - offset2);

                int numberOfFrames = ApplyOffset(reader.ReadInt32(), offset);

                for (int i = 0; i < numberOfFrames; i++)
                {
                    int frameId = ApplyOffset(reader.ReadInt32(), offset);

                    byte animationFrames = ApplyOffsetByte(reader.ReadByte(), offset);

                    if (animationFrames == 1)
                    {
                        int x = ApplyOffset(reader.ReadInt32(), offset);
                        int y = ApplyOffset(reader.ReadInt32(), offset);
                        int w = ApplyOffset(reader.ReadInt32(), offset);
                        int h = ApplyOffset(reader.ReadInt32(), offset);

                        this.Frames.Add(frameId, new Frame(frameId, x, y, w, h));
                    }
                    else
                    {
                        var animation = new AnimationData();
                        animation.Id = frameId;
                        
                        for (int f = 0; f < animationFrames; f++)
                        {
                            animation.Frames.Add(ApplyOffset(reader.ReadInt32(), offset));
                        }

                        animation.Interval = ApplyOffset(reader.ReadByte(), offset);

                        this.Animations.Add(animation);
                    }
                }

                this.FirstFrameIndex = this.Frames.Count == 0 ? 0 : this.Frames.First().Key;

                // not sure what this is, 36 = wav though i think
                int unknown = ApplyOffset(reader.ReadInt32(), offset);
                if (unknown == 36) this.Type = AdfType.Sound;

                int length = (int)(reader.BaseStream.Length - reader.BaseStream.Position);
                byte[] buffer = reader.ReadBytes(length);
                byte[] data = new byte[RealSize(buffer.Length, 0x315)];
                for (int k = 0; k < buffer.Length; k++)
                {
                    data[k - (k / 790)] = ApplyOffsetByte(buffer[k], offset);
                }

                this.FileData = data;
                this.FileNumber = Convert.ToInt32(Path.GetFileNameWithoutExtension(file));
            }
        }

        public static int ApplyOffset(int data, int offset)
        {
            return (data - offset);
        }

        public static byte ApplyOffsetByte(byte data, int offset)
        {
            if (offset > data)
            {
                data = (byte)(data + (0x100 - offset));
                return data;
            }
            data = (byte)(data - offset);
            return data;
        }

        public static int RealSize(int datasize, int chunksize)
        {
            return (datasize - (datasize / (chunksize + 1)));
        }
    }
}
