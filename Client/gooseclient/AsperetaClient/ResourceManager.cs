using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using SDL2;
using System.Linq;

namespace AsperetaClient
{
    class ResourceManager
    {
        public AdfManager AdfManager { get; set; }

        public Dictionary<long, IntPtr> ColouredAdfFileToSDLTexture { get; set; }

        public Dictionary<long, Texture> ColouredFrameIdToTexture { get; set; }

        public Dictionary<string, Texture> FileToTexture { get; set; }

        public IntPtr Renderer { get; set; }

        public ResourceManager(string dataPath, IntPtr renderer)
        {
            this.AdfManager = new AdfManager(dataPath);
            this.ColouredAdfFileToSDLTexture = new Dictionary<long, IntPtr>();
            this.ColouredFrameIdToTexture = new Dictionary<long, Texture>();
            this.FileToTexture = new Dictionary<string, Texture>();
            this.Renderer = renderer;
        }

        public long PackColourIntoId(Colour colour, int id)
        {
            if (colour == null || colour.A == 0)
                return id;

            long result = (long)colour.R << 56;
            result |= (long)colour.G << 48;
            result |= (long)colour.B << 40;
            result |= (long)colour.A << 32;
            result |= (long)id;

            return result;
        }

        public IntPtr GetSDLTexture(AdfFile adfFile, Colour colour)
        {
            long colouredId = PackColourIntoId(colour, adfFile.FileNumber);

            IntPtr texture;
            if (!this.ColouredAdfFileToSDLTexture.TryGetValue(colouredId, out texture))
            {
                var handle = GCHandle.Alloc(adfFile.FileData, GCHandleType.Pinned);
                var ptr = handle.AddrOfPinnedObject();

                var sdlRWops = SDL.SDL_RWFromConstMem(ptr, adfFile.FileData.Length);
                handle.Free();

                var surface = SDL_image.IMG_Load_RW(sdlRWops, 1);
                if (colour != null && colour.A > 0)
                    TintSurface(surface, colour.R, colour.G, colour.B, colour.A);
                SDL.SDL_SetColorKey(surface, 1, 0); // TODO: This isn't the best way, this is setting top left pixel as transparent. Which works for sprites but not for tiles
                texture = SDL.SDL_CreateTextureFromSurface(this.Renderer, surface);

                SDL.SDL_FreeSurface(surface);

                this.ColouredAdfFileToSDLTexture[colouredId] = texture;
            }

            return texture;
        }

        private void TintSurface(IntPtr surface, byte tr, byte tg, byte tb, byte ta)
        {
            unsafe
            {
                SDL.SDL_Surface* surfacePtr = (SDL.SDL_Surface*)surface;

                if (SDL.SDL_MUSTLOCK(surface))
                    SDL.SDL_LockSurface(surface);

                var fmt = (SDL.SDL_PixelFormat*)surfacePtr->format;
                byte* p = (byte*)surfacePtr->pixels.ToPointer();

                if (fmt->BitsPerPixel == 8)
                {
                    var palette = (SDL.SDL_Palette*)fmt->palette;
                    var colours = (SDL.SDL_Color*)palette->colors;

                    for (int i = 0; i < palette->ncolors; i++)
                    {
                        SDL.SDL_Color colour = *(colours + i);
                        if (colour.r == 0 && colour.g == 0 && colour.b == 0) continue;

                        colour.r = (byte)(((ta * ((tr + 256) - colour.r)) >> 8) + colour.r - ta);
                        colour.g = (byte)(((ta * ((tg + 256) - colour.g)) >> 8) + colour.g - ta);
                        colour.b = (byte)(((ta * ((tb + 256) - colour.b)) >> 8) + colour.b - ta);
                        //colour.a = (byte)(((ta * ((ta + 256) - colour.a)) >> 8) + colour.a - ta);

                        *(colours + i) = colour;
                    }

                    return;
                }

                //Console.WriteLine($"Format: {SDL.SDL_GetPixelFormatName(fmt->format)}");

                for (int y = 0; y < surfacePtr->h; y++)
                {
                    for (int x = 0; x < surfacePtr->w; x++)
                    {
                        byte* s = (p + y * surfacePtr->pitch + x * 3);
                        byte b = *(s + 0);
                        byte g = *(s + 1);
                        byte r = *(s + 2);

                        if (r == 0 && g == 0 && b == 0) continue;

                        r = (byte)(((ta * ((tr + 256) - r)) >> 8) + r - ta);
                        g = (byte)(((ta * ((tg + 256) - g)) >> 8) + g - ta);
                        b = (byte)(((ta * ((tb + 256) - b)) >> 8) + b - ta);

                        *(s + 0) = b;
                        *(s + 1) = g;
                        *(s + 2) = r;
                    }
                }

                if (SDL.SDL_MUSTLOCK(surface))
                    SDL.SDL_UnlockSurface(surface);
            }
        }

        public Texture GetTexture(int frameId, Colour colour, bool usedInMap = false, bool usedInSpell = false)
        {
            if (!this.AdfManager.FrameToFile.TryGetValue(frameId, out AdfFile adfFile))
                return null;

            long colouredId = PackColourIntoId(colour, frameId);

            Texture frameTexture;
            if (this.ColouredFrameIdToTexture.TryGetValue(colouredId, out frameTexture))
                return frameTexture;

            var texture = GetSDLTexture(adfFile, colour);

            var frame = adfFile.Frames[frameId];
            frameTexture = new Texture(texture, frame.X, frame.Y, frame.W, frame.H, mapOffset: usedInMap, spellOffset: usedInSpell);

            this.ColouredFrameIdToTexture[colouredId] = frameTexture;
            return frameTexture;
        }

        public Animation GetAnimation(int animationId, Colour colour, bool spellAnimation = false)
        {
            if (!this.AdfManager.Animations.TryGetValue(animationId, out AnimationData animationData))
                return null;

            var animation = new Animation();
            animation.Frames = animationData.Frames.Select(f => GetTexture(f, colour, usedInSpell: spellAnimation)).ToArray();
            animation.Interval = 1.0d / animationData.Interval / 2;

            return animation;
        }

        public Texture GetTexture(string filepath)
        {
            Texture texture;
            if (this.FileToTexture.TryGetValue(filepath, out texture))
                return texture;

            var fileBytes = File.ReadAllBytes(filepath);
            var handle = GCHandle.Alloc(fileBytes, GCHandleType.Pinned);
            var ptr = handle.AddrOfPinnedObject();

            var sdlRWops = SDL.SDL_RWFromConstMem(ptr, fileBytes.Length);
            handle.Free();

            var surfacePointer = SDL_image.IMG_Load_RW(sdlRWops, 1);
            SDL.SDL_SetColorKey(surfacePointer, 1, 0);
            var sdlTexture = SDL.SDL_CreateTextureFromSurface(this.Renderer, surfacePointer);

            var surfaceStruct = Marshal.PtrToStructure<SDL.SDL_Surface>(surfacePointer);

            texture = new Texture(sdlTexture, 0, 0, surfaceStruct.w, surfaceStruct.h, needsOffset: false);

            SDL.SDL_FreeSurface(surfacePointer);

            this.FileToTexture[filepath] = texture;
            return texture;
        }
    }
}
