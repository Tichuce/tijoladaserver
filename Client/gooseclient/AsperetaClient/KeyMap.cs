using System;
using SDL2;

namespace AsperetaClient
{
    public class KeyMap
    {
        public int MoveLeft { get; set; } = (int)SDL.SDL_Scancode.SDL_SCANCODE_LEFT;
        public int MoveRight { get; set; } = (int)SDL.SDL_Scancode.SDL_SCANCODE_RIGHT;
        public int MoveUp { get; set; } = (int)SDL.SDL_Scancode.SDL_SCANCODE_UP;
        public int MoveDown { get; set; } = (int)SDL.SDL_Scancode.SDL_SCANCODE_DOWN;

        public int Attack { get; set; } = (int)SDL.SDL_Scancode.SDL_SCANCODE_SPACE;

        public SDL.SDL_Keycode TargetLeft { get; set; } = SDL.SDL_Keycode.SDLK_LEFT;
        public SDL.SDL_Keycode TargetRight { get; set; } = SDL.SDL_Keycode.SDLK_RIGHT;
        public SDL.SDL_Keycode TargetUp { get; set; } = SDL.SDL_Keycode.SDLK_UP;
        public SDL.SDL_Keycode TargetDown { get; set; } = SDL.SDL_Keycode.SDLK_DOWN;
        public SDL.SDL_Keycode TargetHome { get; set; } = SDL.SDL_Keycode.SDLK_HOME;

        public SDL.SDL_Keycode OpenSpellbook { get; set; } = SDL.SDL_Keycode.SDLK_s;
        public SDL.SDL_Keycode OpenScriptbook { get; set; } = SDL.SDL_Keycode.SDLK_k;

        public void BindWasdMode()
        {
            MoveLeft = (int)SDL.SDL_Scancode.SDL_SCANCODE_A;
            MoveRight = (int)SDL.SDL_Scancode.SDL_SCANCODE_D;
            MoveUp = (int)SDL.SDL_Scancode.SDL_SCANCODE_W;
            MoveDown = (int)SDL.SDL_Scancode.SDL_SCANCODE_S;

            TargetLeft = SDL.SDL_Keycode.SDLK_a;
            TargetRight = SDL.SDL_Keycode.SDLK_d;
            TargetUp = SDL.SDL_Keycode.SDLK_w;
            TargetDown = SDL.SDL_Keycode.SDLK_s;

            OpenSpellbook = SDL.SDL_Keycode.SDLK_j;
            OpenScriptbook = SDL.SDL_Keycode.SDLK_k;
        }
    }
}
