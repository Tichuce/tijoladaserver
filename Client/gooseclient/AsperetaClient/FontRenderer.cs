using System;
using System.Collections.Generic;
using SDL2;

namespace AsperetaClient
{
    class FontRenderer
    {
        private IntPtr FontTexture { get; set; }
        private int[] CharOffsets = new int[255];

        public int CharHeight { get { return 11; } }
        public int CharWidth { get { return 6; } }

        public const string Letters = "!\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";

        public FontRenderer()
        {
            this.FontTexture = GameClient.ResourceManager.GetSDLTexture(GameClient.ResourceManager.AdfManager.Files[101], null);

            SDL.SDL_SetTextureBlendMode(this.FontTexture, SDL.SDL_BlendMode.SDL_BLENDMODE_BLEND);

            int offset = 0;
            foreach (var c in Letters)
            {
                CharOffsets[(int)c] = offset;
                offset += CharWidth;
            }
        }

        public void RenderText(string text, int x, int y, Colour colour, int limitX = 0)
        {
            SDL.SDL_SetTextureColorMod(this.FontTexture, colour.R, colour.G, colour.B);
            SDL.SDL_SetTextureAlphaMod(this.FontTexture, colour.A);

            SDL.SDL_Rect dRect;
            dRect.y = y;
            dRect.w = CharWidth;
            dRect.h = CharHeight;

            SDL.SDL_Rect sRect;
            sRect.y = 0;
            sRect.w = CharWidth;
            sRect.h = CharHeight;

            foreach (var c in text)
            {
                if (c == ' ')
                {
                    x += CharWidth;
                    continue;
                }

                int i = c;
                if (c > 256)
                    i = '`';

                sRect.x = CharOffsets[i];
                dRect.x = x;

                SDL.SDL_RenderCopy(GameClient.Renderer, FontTexture, ref sRect, ref dRect);

                x += CharWidth;

                if (limitX > 0 && x > limitX)
                    return;
            }
        }

        public void RenderWrapped(string value, int sx, int sy, int xOffset, int yOffset, int maxWidth, Colour colour)
        {
            int availableSpace = maxWidth;
            int neededSpace = value.Length * GameClient.FontRenderer.CharWidth;
            int currentIndex = 0;

            int y = yOffset + sy;

            while (currentIndex < value.Length)
            {
                int x = xOffset + sx;

                if (neededSpace < availableSpace)
                {
                    GameClient.FontRenderer.RenderText(value.Substring(currentIndex), x, y, colour);
                    return;
                }

                bool failedToSplit = true;
                for (int i = (availableSpace / GameClient.FontRenderer.CharWidth) - 1; i > 0; i--)
                {
                    if (value[currentIndex + i] == ' ')
                    {
                        GameClient.FontRenderer.RenderText(value.Substring(currentIndex, i), x, y, colour);

                        currentIndex += i + 1;
                        neededSpace = (value.Length - currentIndex) * GameClient.FontRenderer.CharWidth;

                        failedToSplit = false;

                        break;
                    }
                }

                if (failedToSplit)
                {
                    int splitPoint = (availableSpace / GameClient.FontRenderer.CharWidth) - 1;
                    GameClient.FontRenderer.RenderText(value.Substring(currentIndex, splitPoint), x, y, colour);

                    currentIndex += splitPoint;
                    neededSpace = (value.Length - currentIndex) * GameClient.FontRenderer.CharWidth;
                }

                y += GameClient.FontRenderer.CharHeight;
            }
        }

        public IEnumerable<string> WordWrap(string input, int maxWidth, string indentString)
        {
            int availableSpace = maxWidth;
            int availableCharacters = (availableSpace / GameClient.FontRenderer.CharWidth) - 1;
            int neededSpace = input.Length * GameClient.FontRenderer.CharWidth;
            int currentIndex = 0;

            bool indent = false;

            while (currentIndex < input.Length)
            {
                if (neededSpace < availableSpace)
                {
                    yield return (indent ? indentString : "") + input.Substring(currentIndex);
                    yield break;
                }

                bool failedToSplit = true;
                for (int i = availableCharacters; i > 0; i--)
                {
                    if (input[currentIndex + i] == ' ')
                    {
                        yield return (indent ? indentString : "") + input.Substring(currentIndex, i);
                        currentIndex += i + 1;

                        indent = true;
                        availableCharacters = (availableSpace / GameClient.FontRenderer.CharWidth) - 1 - indentString.Length;

                        neededSpace = (input.Length - currentIndex) * GameClient.FontRenderer.CharWidth;

                        failedToSplit = false;

                        break;
                    }
                }

                if (failedToSplit)
                {
                    int splitPoint = availableCharacters;

                    yield return (indent ? indentString : "") + input.Substring(currentIndex, splitPoint);
                    currentIndex += splitPoint;

                    indent = true;
                    availableCharacters = (availableSpace / GameClient.FontRenderer.CharWidth) - 1 - indentString.Length;
                    
                    neededSpace = (input.Length - currentIndex) * GameClient.FontRenderer.CharWidth;
                }
            }
        }
    }
}
