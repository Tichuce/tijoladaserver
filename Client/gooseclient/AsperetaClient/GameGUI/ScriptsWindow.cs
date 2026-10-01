using System;
using System.Linq;

namespace AsperetaClient
{
    public class ScriptsWindow : BaseWindow
    {
        private ScriptSlot[] slots;

        private int numberOfScripts = 0;

        public ScriptsWindow() : base("BlankMessage")
        {
            hideShortcutKey = GameClient.KeyMap.OpenScriptbook;

            titleLabel.Value = "Scripts";

            rows = 6;
            columns = 8;
            objW = 32;
            objH = 32;

            slots = new ScriptSlot[rows * columns];
            for (int r = 0; r < rows; r++)
            {
                for (int c = 0; c < columns; c++)
                {
                    int x = objoffX + c * objW;
                    int y = objoffY + r * objH;

                    var slot = new ScriptSlot(r * columns + c, x, y, objW, objH);
                    this.AddChild(slot);

                    slots[r * columns + c] = slot;
                }
            }

            AddReloadButton();
        }

        public ScriptSlot AddScript(string name, int graphicId, Colour colour, Action<GuiElement> onUsed)
        {
            var slot = slots[numberOfScripts];
            slot.SetScript(name, graphicId, colour, onUsed);
            numberOfScripts++;

            return slot;
        }

        public override void SaveState()
        {
        }

        private void AddReloadButton()
        {
            var buttonSection = GameClient.ButtonSettings.Sections[WindowButtons.Blank.ToString()];
            var buttonTextures = buttonSection["image"].Split(',');

            var upTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{buttonTextures[0]}");
            var downTexture = GameClient.ResourceManager.GetTexture($"skins/{GameClient.GameSettings["INIT"]["Skin"]}/{buttonTextures[1]}");

            var button = new Button(95, 267, upTexture.W, upTexture.H, "Reload");
            button.UpTexture = upTexture;
            button.DownTexture = downTexture;
            button.Clicked += OnReloadClicked;
            this.AddChild(button);
        }

        private void OnReloadClicked(Button button)
        {
            ClearSlots();
            GameClient.ScriptManager.ReloadScripts();
        }

        private void ClearSlots()
        {
            foreach (var slot in slots)
            {
                slot?.Clear();
            }

            numberOfScripts = 0;
        }
    }
}