using System;

namespace AsperetaClient
{
    public enum AutoHuntState
    {
        Off,
        On,
        Paused
    }

    // Follows the server's auto-hunt state. The server stays the authority: the client only sends
    // /autohunt commands and changes state when the server's reply arrives, so what the UI shows
    // is always what the server is actually doing.
    public class AutoHuntTracker
    {
        private const double RequestTimeoutSeconds = 3;

        private double pendingTime = 0;

        public AutoHuntState State { get; private set; } = AutoHuntState.Off;

        // True between sending a command and the server answering it.
        public bool Pending => pendingTime > 0;

        public event Action<AutoHuntState> StateChanged;

        public AutoHuntTracker()
        {
            GameClient.NetworkClient.PacketManager.Listen<ServerMessagePacket>(OnServerMessage);
        }

        // Maps the server's auto-hunt messages to a state, or null if the message isn't one of them.
        public static AutoHuntState? ParseServerMessage(string message)
        {
            if (message == null) return null;

            if (message.StartsWith("Auto-hunt started.") || message.StartsWith("Auto-hunt resumed.") ||
                message.StartsWith("Auto-hunt is already running."))
                return AutoHuntState.On;

            if (message.StartsWith("Auto-hunt paused.") || message.StartsWith("Auto-hunt is already paused."))
                return AutoHuntState.Paused;

            if (message.StartsWith("Auto-hunt stopped:") || message.StartsWith("Auto-hunt is not running.") ||
                message.StartsWith("Auto-hunt is disabled"))
                return AutoHuntState.Off;

            return null;
        }

        private void OnServerMessage(object packet)
        {
            var p = (ServerMessagePacket)packet;
            if (p.ChatType != ChatType.Server) return;

            var state = ParseServerMessage(p.Message);
            if (state != null)
            {
                SetState(state.Value);
            }
            else if (p.Message.IndexOf("auto-hunt", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                // The server refused the request (e.g. "Dismount before starting auto-hunt.").
                pendingTime = 0;
            }
        }

        public void SetState(AutoHuntState state)
        {
            pendingTime = 0;

            if (State == state) return;

            State = state;
            StateChanged?.Invoke(state);
        }

        // Left click: OFF -> ON, ON -> PAUSED, PAUSED -> ON.
        public void RequestNext()
        {
            if (Pending) return;

            Send(State == AutoHuntState.On ? "/autohunt pause" : "/autohunt on");
        }

        // Right click: any -> OFF.
        public void RequestOff()
        {
            if (Pending || State == AutoHuntState.Off) return;

            Send("/autohunt off");
        }

        private void Send(string command)
        {
            pendingTime = RequestTimeoutSeconds;
            GameClient.NetworkClient.Command(command);
        }

        public void Update(double dt)
        {
            if (pendingTime > 0)
                pendingTime = Math.Max(0, pendingTime - dt);
        }
    }
}
