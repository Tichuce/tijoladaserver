using System;
using System.Collections.Generic;
using SDL2;

namespace AsperetaClient
{
    class MapLoadingScreen : State
    {
        private Texture background;

        private Label label;

        private int mapNumber;

        private string mapName;

        private GameScreen gameScreen;

        private IEnumerator<int> mapLoader;

        private bool done = false;
        
        public MapLoadingScreen(int mapNumber, string mapName, GameScreen gameScreen)
        {
            this.mapNumber = mapNumber;
            this.mapName = mapName;
            this.gameScreen = gameScreen;
            this.gameScreen.Map = null;

            GameClient.NetworkClient.PacketManager.Listen<DoneSendingMapPacket>(OnDoneSendingMap);
        }

        public override void Starting()
        {
            GameClient.ScreenWidth = 640;
            GameClient.ScreenHeight = 480;
            SDL.SDL_RenderSetLogicalSize(GameClient.Renderer, GameClient.ScreenWidth, GameClient.ScreenHeight);

            background = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/Background.bmp");

            label = new Label(-1, -1, Colour.White, $"Loading {mapName}");
        }

        public override void Ending()
        {
            GameClient.NetworkClient.PacketManager.Remove<DoneSendingMapPacket>(OnDoneSendingMap);
        }

        public override void Update(double dt)
        {
            if (this.gameScreen.Map == null)
            {
                this.gameScreen.Map = new Map(AsperetaMapLoader.Load(mapNumber), this.gameScreen);
                mapLoader = this.gameScreen.Map.Load().GetEnumerator();
            }
            else if (this.gameScreen.Map.Loaded)
            {
                if (!done)
                {
                    done = true;
                    GameClient.NetworkClient.DoneLoadingMap();
                }
            }
            else
            {
                mapLoader.MoveNext();
            }
        }

        public override void Render(double dt)
        {
            background.Render(0, 0);
            label.Render(dt, 0, 0);
        }

        public override void HandleEvent(SDL.SDL_Event ev)
        {
            
        }

        public void OnDoneSendingMap(object packet)
        {
            GameClient.StateManager.RemoveState();
        }
    }
}
