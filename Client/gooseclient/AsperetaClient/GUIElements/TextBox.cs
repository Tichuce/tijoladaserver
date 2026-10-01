using System;
using System.Runtime.InteropServices;
using SDL2;

namespace AsperetaClient
{
    // TODO: Right now this is only a basic textbox. Still need to support:
    // * arrow keys for moving the cursor
    // * clicking in textbox to change cursor position
    // * Selecting text and associated functions (copy/overwrite/delete)

    public class TextBox : GuiElement
    {
        public char PasswordMask { get; set; }

        public string Value { get; private set; }

        public int CursorPosition { get; set; }

        public int ScrollPosition { get; set; }

        public bool PreventFurtherEventsOnInput { get; set; }

        public int MaxLength = 0;

        private double cursorFlashTime = 0;
        private bool cursorVisible = true;

        public event Action EnterPressed;
        public event Action EscapePressed;
        public event Action TabPressed;
        public event Action UpPressed;
        public event Action DownPressed;

        private int maxRenderChars;

        public TextBox(int x, int y, int w, int h, Colour backgroundColour, Colour foregroundColour) : base(x, y, w, h, backgroundColour, foregroundColour)
        {
            this.Value = "";
            this.CursorPosition = 0;
            this.ScrollPosition = 0;
            this.Padding = 5;
            this.PreventFurtherEventsOnInput = false;

            this.maxRenderChars = (this.W - this.Padding) / GameClient.FontRenderer.CharWidth + 1;
        }

        public override void Update(double dt)
        {
            cursorFlashTime += dt;

            if (cursorFlashTime >= 1)
            {
                cursorFlashTime -= 1;
                cursorVisible = !cursorVisible;
            }
        }

        public override void Render(double dt, int xOffset, int yOffset)
        {
            if (BackgroundColour != null)
            {
                SDL.SDL_SetRenderDrawColor(GameClient.Renderer, BackgroundColour.R, BackgroundColour.G, BackgroundColour.B, BackgroundColour.A);
                SDL.SDL_Rect dRect;
                dRect.x = X + xOffset;
                dRect.y = Y + yOffset;
                dRect.w = W;
                dRect.h = H;
                SDL.SDL_RenderFillRect(GameClient.Renderer, ref dRect);
            }

            int centeredY = (H - GameClient.FontRenderer.CharHeight) / 2;

            string renderText = Value;
            if (PasswordMask != 0)
                renderText = new string(PasswordMask, Value.Length);

            RenderText(renderText, xOffset, yOffset, centeredY);

            if (this.HasFocus && cursorVisible)
            {
                int cursorX = xOffset + this.X + this.Padding + (this.CursorPosition - this.ScrollPosition) * GameClient.FontRenderer.CharWidth;

                SDL.SDL_SetRenderDrawColor(GameClient.Renderer, ForegroundColour.R, ForegroundColour.G, ForegroundColour.B, ForegroundColour.A);
                SDL.SDL_RenderDrawLine(GameClient.Renderer, 
                    cursorX, 
                    yOffset + this.Y + centeredY - 1, 
                    cursorX, 
                    yOffset + this.Y + centeredY + GameClient.FontRenderer.CharHeight);
            }
        }

        private void RenderText(string text, int xOffset, int yOffset, int centeredY)
        {
            text = text.Substring(ScrollPosition, Math.Min(maxRenderChars - 1, text.Length - ScrollPosition));
            GameClient.FontRenderer.RenderText(text, xOffset + this.X + this.Padding, yOffset + this.Y + centeredY, ForegroundColour);
        }

        public override bool HandleEvent(SDL.SDL_Event ev, int xOffset, int yOffset)
        {
            switch (ev.type)
            {
                case SDL.SDL_EventType.SDL_MOUSEBUTTONUP:
                    if (Contains(xOffset, yOffset, ev.button.x, ev.button.y))
                    {
                        this.SetFocused();
                    }
                    else if (this.HasFocus)
                    {
                        this.RemoveFocused();
                    }
                    break;
                case SDL.SDL_EventType.SDL_KEYDOWN:
                    if (!this.HasFocus) break;

                    // Handle backspace
                    if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_BACKSPACE && this.CursorPosition > 0)
                    {
                        string newValue = this.Value.Substring(0, this.CursorPosition - 1);
                        if (this.CursorPosition < this.Value.Length)
                            newValue += this.Value.Substring(this.CursorPosition);

                        this.Value = newValue;

                        this.CursorPosition--;
                        this.ScrollPosition = Math.Max(0, this.ScrollPosition - 1);
                    }
                    // Handle copy
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_c && (SDL.SDL_GetModState() & SDL.SDL_Keymod.KMOD_CTRL) != SDL.SDL_Keymod.KMOD_NONE)
                    {
                        SDL.SDL_SetClipboardText(this.Value);
                    }
                    // Handle paste
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_v && (SDL.SDL_GetModState() & SDL.SDL_Keymod.KMOD_CTRL) != SDL.SDL_Keymod.KMOD_NONE)
                    {
                        var pastedText = SDL.SDL_GetClipboardText();
                        this.Value = this.Value.Substring(0, this.CursorPosition) + pastedText + this.Value.Substring(this.CursorPosition);
                        this.CursorPosition += pastedText.Length;

                        if (this.MaxLength > 0 && this.Value.Length >= this.MaxLength)
                        {
                            this.Value = this.Value.Substring(0, this.MaxLength);
                            this.CursorPosition = Math.Min(this.MaxLength, this.CursorPosition);
                        }

                        if (this.CursorPosition >= this.ScrollPosition + maxRenderChars)
                            this.ScrollPosition = this.CursorPosition - maxRenderChars + 1;
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_RETURN || ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_KP_ENTER)
                    {
                        EnterPressed?.Invoke();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_ESCAPE)
                    {
                        EscapePressed?.Invoke();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_TAB)
                    {
                        TabPressed?.Invoke();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_UP)
                    {
                        UpPressed?.Invoke();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_DOWN)
                    {
                        DownPressed?.Invoke();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_LEFT)
                    {
                       if (this.CursorPosition == this.ScrollPosition)
                            this.ScrollPosition = Math.Max(0, this.ScrollPosition - 1);

                        this.CursorPosition = Math.Max(0, this.CursorPosition - 1);

                        ShowCursor();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_RIGHT)
                    {
                        this.CursorPosition = Math.Min(this.Value.Length, this.CursorPosition + 1);

                        if (this.CursorPosition >= this.ScrollPosition + maxRenderChars)
                            this.ScrollPosition = this.CursorPosition - maxRenderChars + 1;
                        
                        ShowCursor();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_HOME)
                    {
                        this.CursorPosition = 0;
                        this.ScrollPosition = 0;
                        ShowCursor();
                    }
                    else if (ev.key.keysym.sym == SDL.SDL_Keycode.SDLK_END)
                    {
                        this.CursorPosition = Value.Length;
                        if (this.CursorPosition >= this.ScrollPosition + maxRenderChars)
                            this.ScrollPosition = this.CursorPosition - maxRenderChars + 1;
                        ShowCursor();
                    }

                    // To stop opening of inventory/etc windows while typing
                    if (PreventFurtherEventsOnInput) return true;

                    break;
                case SDL.SDL_EventType.SDL_TEXTINPUT:
                    if (!this.HasFocus || (this.MaxLength > 0 && this.Value.Length >= this.MaxLength)) break;

                    byte[] rawBytes = new byte[SDL.SDL_TEXTINPUTEVENT_TEXT_SIZE];

                    unsafe { Marshal.Copy((IntPtr)ev.text.text, rawBytes, 0, SDL.SDL_TEXTINPUTEVENT_TEXT_SIZE); }

                    int length = Array.IndexOf(rawBytes, (byte)0);
                    string text = System.Text.Encoding.UTF8.GetString(rawBytes, 0, length);

                    // Not copy or pasting
                    if(!((SDL.SDL_GetModState() & SDL.SDL_Keymod.KMOD_CTRL) != SDL.SDL_Keymod.KMOD_NONE && (text[0] == 'c' || text[0] == 'C' || text[0] == 'v' || text[0] == 'V')))
                    {
                        // Append character
                        this.Value = this.Value.Substring(0, this.CursorPosition) + text + this.Value.Substring(this.CursorPosition);
                        this.CursorPosition += text.Length;

                        if (this.CursorPosition >= this.ScrollPosition + maxRenderChars)
                            this.ScrollPosition = this.CursorPosition - maxRenderChars + 1;
                    }
                    break;
            }

            return false;
        }

        public void SetValue(string value)
        {
            this.Value = value;
            this.CursorPosition = value.Length;
            this.ScrollPosition = 0;

            if (this.CursorPosition >= this.ScrollPosition + maxRenderChars)
                this.ScrollPosition = this.CursorPosition - maxRenderChars + 1;
        }

        public void SetFocused()
        {
            UiRoot.FocusedTextBox = this;

            this.HasFocus = true;
            ShowCursor();
        }

        public void RemoveFocused()
        {
            this.HasFocus = false;
            if (UiRoot.FocusedTextBox == this)
            {
                UiRoot.FocusedTextBox = null;
            }
        }

        private void ShowCursor()
        {
            cursorFlashTime = 1; // Make cursor appear immediately
            cursorVisible = false;
        }
    }
}
