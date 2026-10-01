using System;
using System.Collections.Generic;
using System.Linq;
using SDL2;

namespace AsperetaClient
{
    class LoginScreen : State
    {
        private Texture background;
        private Texture loginBox;

        private int loginBoxX;
        private int loginBoxY;

        private TextBox usernameTextbox;
        private TextBox passwordTextbox;

        private RootPanel guiContainer = new RootPanel();

        public override void Starting()
        {
            GameClient.ScreenWidth = 800;
            GameClient.ScreenHeight = 600;
            SDL.SDL_RenderSetLogicalSize(GameClient.Renderer, GameClient.ScreenWidth, GameClient.ScreenHeight);

            background = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{GameClient.WindowSettings["LoginScreen"]["image"]}");
            loginBox = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{GameClient.WindowSettings["LoginScreen"]["box_image"]}");

            var loginBoxCoords = GameClient.WindowSettings.GetCoords("LoginScreen", "login_box").ToArray();
            this.loginBoxX = loginBoxCoords[0];
            this.loginBoxY = loginBoxCoords[1];

            var foregroundColour = GameClient.ParseColour(GameClient.WindowSettings["LoginScreen"]["foreground_colour"]);
            var backgroundColour = GameClient.ParseColour(GameClient.WindowSettings["LoginScreen"]["background_colour"]);

            var usernameCoords = GameClient.WindowSettings.GetCoords("LoginScreen", "username_textbox").ToArray();
            usernameTextbox = new TextBox(usernameCoords[0], usernameCoords[1], usernameCoords[2], usernameCoords[3], backgroundColour, foregroundColour);
            usernameTextbox.TabPressed += UsernameTabbed;

            var passwordCoords = GameClient.WindowSettings.GetCoords("LoginScreen", "password_textbox").ToArray();
            passwordTextbox = new TextBox(passwordCoords[0], passwordCoords[1], passwordCoords[2], passwordCoords[3], backgroundColour, foregroundColour) { PasswordMask = '*' };
            passwordTextbox.EnterPressed += Connect;

            usernameTextbox.SetValue(GameClient.GameSettings["INIT"]["Name"]);
            if (GameClient.GameSettings["INIT"].ContainsKey("Password"))
                passwordTextbox.SetValue(GameClient.GameSettings["INIT"]["Password"]);

            if (string.IsNullOrEmpty(usernameTextbox.Value))
                usernameTextbox.SetFocused();
            else
                passwordTextbox.SetFocused();

            guiContainer.AddChild(usernameTextbox);
            guiContainer.AddChild(passwordTextbox);

            var loginTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{GameClient.WindowSettings["LoginScreen"]["login_image"]}");
            var loginCoords = GameClient.WindowSettings.GetCoords("LoginScreen", "login_button").ToArray();
            var loginButton = new Button(loginCoords[0], loginCoords[1], loginTexture.W, loginTexture.H)
            { 
                UpTexture = loginTexture
            };
            loginButton.Clicked += Connect;

            var exitTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{GameClient.WindowSettings["LoginScreen"]["exit_image"]}");
            var exitCoords = GameClient.WindowSettings.GetCoords("LoginScreen", "exit_button").ToArray();
            var exitButton = new Button(exitCoords[0], exitCoords[1], exitTexture.W, exitTexture.H)
            {
                UpTexture = exitTexture
            };
            exitButton.Clicked += (_) => { GameClient.Running = false; };

            guiContainer.AddChild(loginButton);
            guiContainer.AddChild(exitButton);
        }

        public override void Update(double dt)
        {
            guiContainer.Update(dt);
        }

        public override void Render(double dt)
        {
            background.Render(0, 0);
            loginBox.Render(loginBoxX, loginBoxY);

            guiContainer.Render(dt, 0, 0);
        }

        public override void HandleEvent(SDL.SDL_Event ev)
        {
            guiContainer.HandleEvent(ev, 0, 0);
        }

        public void Connect(Button b)
        {
            Connect();
        }

        public void Connect()
        {
            if (usernameTextbox.Value.Length <= 1 || passwordTextbox.Value.Length <= 1)
                return;

            GameClient.NetworkClient = new NetworkClient();
            GameClient.NetworkClient.SocketError += OnSocketError;

            GameClient.NetworkClient.PacketManager.Listen<PingPacket>(OnPing);

            var connectingWindow = new ConnectingWindow(usernameTextbox.Value, passwordTextbox.Value);
            guiContainer.AddChild(connectingWindow);
        }

        public void OnSocketError(Exception e)
        {
            Console.WriteLine($"Socket exception: {e}");

            var messageWindow = new MessageWindow($"Disconnected: {e.Message}");
            guiContainer.AddChild(messageWindow);

            GameClient.StateManager.RemoveState();
        }

        public void OnPing(object packet)
        {
            GameClient.NetworkClient.Pong();
        }

        public void UsernameTabbed()
        {
            usernameTextbox.RemoveFocused();
            passwordTextbox.SetFocused();
        }
    }
}
