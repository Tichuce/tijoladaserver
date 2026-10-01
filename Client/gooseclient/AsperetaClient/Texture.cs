using System;
using SDL2;

namespace AsperetaClient
{
    public class Texture
    {
        public IntPtr SDLTexture { get; set; }

        private SDL.SDL_Rect Rect;

        public int W { get { return Rect.w; } }
        public int H { get { return Rect.h; } }

        public int XOffset { get; private set; }
        public int YOffset { get; private set; }

        private static SDL.SDL_BlendMode Blender { get; set; }

        static Texture()
        {
            Blender = SDL.SDL_ComposeCustomBlendMode(
                srcColorFactor: SDL.SDL_BlendFactor.SDL_BLENDFACTOR_DST_COLOR,
                dstColorFactor: SDL.SDL_BlendFactor.SDL_BLENDFACTOR_ONE_MINUS_SRC_ALPHA,
                colorOperation: SDL.SDL_BlendOperation.SDL_BLENDOPERATION_ADD,

                srcAlphaFactor: SDL.SDL_BlendFactor.SDL_BLENDFACTOR_SRC_COLOR,
                dstAlphaFactor: SDL.SDL_BlendFactor.SDL_BLENDFACTOR_ONE_MINUS_SRC_ALPHA,
                alphaOperation: SDL.SDL_BlendOperation.SDL_BLENDOPERATION_ADD
            );
        }

        public Texture(IntPtr texture, int x, int y, int w, int h, bool needsOffset = true, bool mapOffset = false, bool spellOffset = false)
        {
            this.SDLTexture = texture;

            SDL.SDL_Rect tRect;
            tRect.x = x;
            tRect.y = y;
            tRect.w = w;
            tRect.h = h;

            Rect = tRect;

            if (needsOffset)
            {
                // offset to center the sprite on the tile
                XOffset = (Constants.TileSize / 2) - Rect.w / 2;

                if (mapOffset)// && Rect.h > Constants.TileSize * 2)
                    YOffset = -Rect.h + Constants.TileSize;
                else if (spellOffset)
                    YOffset = -Math.Max((Rect.h - 48) / 2, 0) - 8;
                else if (Rect.h > Constants.TileSize)
                    YOffset = -Math.Max((Rect.h - 48) / 2, 0) - 16;
            }
        }

        public void Render(int x, int y, Colour colour = null)
        {
            SDL.SDL_Rect dRect;
            dRect.x = x + XOffset;
            dRect.y = y + YOffset;
            dRect.w = Rect.w;
            dRect.h = Rect.h;

            if (colour == null || colour.A == 0)
            {
                SDL.SDL_SetTextureColorMod(SDLTexture, 255, 255, 255);
                // SDL.SDL_SetTextureAlphaMod(SDLTexture, 0);
            }
            else
            {
                // https://github.com/dgoodlad/vbdabl -- look at this for how asp's is done.. still need to figure out how to do this in SDL
                // https://discourse.libsdl.org/t/sdl2-renderer-sdl-blendmode-mod-with-alpha/26947/4
                //SDL.SDL_SetTextureBlendMode(SDLTexture, SDL.SDL_BlendMode.SDL_BLENDMODE_BLEND);
                //SDL.SDL_SetTextureColorMod(SDLTexture, (byte)(colour.R * (400d / colour.A)), (byte)(colour.G * (400d / colour.A)), (byte)(colour.B * (400d / colour.A)));
                //SDL.SDL_SetTextureColorMod(SDLTexture, colour.R, colour.G, colour.B);
                //SDL.SDL_SetTextureAlphaMod(SDLTexture, colour.A);
            }

            SDL.SDL_RenderCopy(GameClient.Renderer, SDLTexture, ref Rect, ref dRect);
        }

        public void Render(int x, int y, int w, int h)
        {
            SDL.SDL_Rect dRect;
            dRect.x = x + XOffset;
            dRect.y = y + YOffset;
            dRect.w = w;
            dRect.h = h;

            SDL.SDL_RenderCopy(GameClient.Renderer, SDLTexture, ref Rect, ref dRect);
        }

        public void Render(int x, int y, int alpha)
        {
            SDL.SDL_Rect dRect;
            dRect.x = x + XOffset;
            dRect.y = y + YOffset;
            dRect.w = Rect.w;
            dRect.h = Rect.h;

            SDL.SDL_SetTextureAlphaMod(SDLTexture, (byte)alpha);
            SDL.SDL_RenderCopy(GameClient.Renderer, SDLTexture, ref Rect, ref dRect);
        }

        public void RenderClipped(int x, int y, int w, int h)
        {
            SDL.SDL_Rect sRect;
            sRect.x = Rect.x;
            sRect.y = Rect.y;
            sRect.w = w;
            sRect.h = h;

            SDL.SDL_Rect dRect;
            dRect.x = x + XOffset;
            dRect.y = y + YOffset;
            dRect.w = w;
            dRect.h = h;

            SDL.SDL_RenderCopy(GameClient.Renderer, SDLTexture, ref sRect, ref dRect);
        }
    }
}
