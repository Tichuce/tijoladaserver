using System;

namespace AsperetaClient
{
    public class ScriptSlot : BaseSlot
    {
        private Action<GuiElement> onUsed;

        public ScriptSlot(int slotNumber, int x, int y, int w, int h) : base(slotNumber, x, y, w, h)
        {
            this.DoubleClicked += OnDoubleClicked;
        }

        private void OnDoubleClicked(GuiElement element)
        {
            this.onUsed?.Invoke(element);
        }

        public void SetScript(string name, int graphicId, Colour colour, Action<GuiElement> onUsed)
        {
            this.Name = name;
            this.Graphic = GameClient.ResourceManager.GetTexture(graphicId, colour);
            this.Colour = colour;
            this.onUsed = onUsed;
        }

        public void SetIcon(string name, int graphicId, Colour colour)
        {
            this.Name = name;
            this.Graphic = GameClient.ResourceManager.GetTexture(graphicId, colour);
            this.Colour = colour;
        }

        public override void HandleDrop(object data)
        {
        }
    }
}
