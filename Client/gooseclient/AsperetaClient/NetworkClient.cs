using System;
using System.Net.Sockets;
using System.Collections.Generic;
using System.Collections.Concurrent;

namespace AsperetaClient
{
    class NetworkClient
    {
        public event Action<Exception> ConnectionError;
        public event Action Connected;
        public event Action<Exception> SocketError;

        public PacketManager PacketManager { get; set; } = new PacketManager();

        public bool IsConnected { get { return socket == null ? false : socket.Connected; } }

        private Socket socket;

        private string packetBuffer;

        private ConcurrentQueue<byte[]> sendQueue = new();

        public void Connect()
        {
            try
            {
                packetBuffer = "";
                socket = new Socket(SocketType.Stream, ProtocolType.Tcp);
                socket.NoDelay = true;
                socket.Connect(GameClient.ServerInfoSettings.Sections["Settings"]["IP"], GameClient.ServerInfoSettings.GetInt("Settings", "Port"));

                Connected?.Invoke();
            }
            catch (Exception e)
            {
                ConnectionError?.Invoke(e);
            }
        }

        public void Disconnect()
        {
            try
            {
                if (socket != null && socket.Connected)
                    socket.Shutdown(SocketShutdown.Both);
            }
            finally
            {
                socket?.Close();
            }

            socket = null;
        }

        public void Send(string packet)
        {
            packet += '\x1';
            sendQueue.Enqueue(System.Text.Encoding.ASCII.GetBytes(packet));
        }

        public void Update()
        {
            if (!IsConnected) return;

            var readSockets = new List<Socket> { socket };

            Socket.Select(readSockets, null, null, 500);

            foreach (var socket in readSockets)
            {
                try
                {
                    var buffer = new byte[8192];

                    int received = socket.Receive(buffer);
                    string receivedString = System.Text.Encoding.ASCII.GetString(buffer, 0, received);
                    packetBuffer += receivedString;

                    //Console.WriteLine($"Received: {receivedString.Replace('\x1', '\n')}");

                    if (packetBuffer.Length == 0) continue;

                    string[] packets = packetBuffer.Split('\x1');
                    packetBuffer = packets[packets.Length - 1];

                    // skip the last packet since it will either be empty, or an incomplete packet
                    for (int i = 0; i < packets.Length - 1; i++)
                    {
                        //Console.WriteLine($"P: {packets[i]}");
                        try
                        {
                            PacketManager.Handle(packets[i]);
                        }
                        catch (Exception e)
                        {
                            // A packet the client can't process shouldn't end the session; log it and carry on.
                            Console.WriteLine($"Error handling packet {packets[i]}: {e}");
                        }
                    }
                }
                catch (Exception e)
                {
                    SocketError?.Invoke(e);
                }
            }

            while (!sendQueue.IsEmpty && sendQueue.TryDequeue(out var packet))
            {
                try
                {
                    socket.Send(packet);
                }
                catch (Exception e)
                {
                    SocketError?.Invoke(e);
                }
            }
        }



        public void Login(string username, string password)
        {            
            Send($"LOGIN{username},{password},GooseClient");
        }

        public void LoginContinued()
        {
            Send($"LCNT");
        }

        public void DoneLoadingMap()
        {
            Send($"DLM");
        }

        public void Pong()
        {
            Send($"PONG");
        }

        public void Facing(Direction d)
        {
            // old asp client remaps facing for some reason...
            int[] directionRemap = [1, 4, 2, 3];
            int facing = directionRemap[(int)d];

            Send($"F{facing}");
        }

        public void Move(Direction d)
        {
            Send($"M{(int)d + 1}");
        }

        public void ChatMessage(string message)
        {
            Send($";{message}");
        }

        public void Command(string command)
        {
            Send(command);
        }

        public void Use(int slotNumber)
        {
            Send($"USE{slotNumber + 1}");
        }

        public void Change(int fromSlot, int toSlot)
        {
            Send($"CHANGE{fromSlot + 1},{toSlot + 1}");
        }

        public void Split(int fromSlot, int toSlot)
        {
            Send($"SPLIT{fromSlot + 1},{toSlot + 1}");
        }

        public void InventoryToWindow(int fromSlot, int windowId, int toSlot)
        {
            Send($"ITW{fromSlot + 1},{windowId},{toSlot + 1}");
        }

        public void WindowToInventory(int windowId, int fromSlot, int toSlot)
        {
            Send($"WTI{windowId},{fromSlot + 1},{toSlot + 1}");
        }

        public void WindowToWindow(int fromWindowId, int fromSlot, int toWindowId, int toSlot)
        {
            Send($"WTW{fromWindowId},{fromSlot + 1},{toWindowId},{toSlot + 1}");
        }

        public void Cast(int slot, int targetId)
        {
            Send($"CAST{slot + 1},{targetId}");
        }

        public void Get()
        {
            Send($"GET");
        }

        public void KillBuff(int slot)
        {
            Send($"KBUF{slot + 1}");
        }

        public void Attack()
        {
            Send($"ATT");
        }

        public void DropItem(int slot, int stackSize)
        {
            Send($"DRP{slot + 1},{stackSize}");
        }

        public void LeftClick(int tileX, int tileY)
        {
            Send($"LC{tileX + 1},{tileY + 1}");
        }

        public void RightClick(int tileX, int tileY)
        {
            Send($"RC{tileX + 1},{tileY + 1}");
        }

        public void WindowButtonClick(int buttonId, int windowId, int npcId, int unknownId1 = 0, int unknownId2 = 0)
        {
            Send($"WBC{buttonId + 1},{windowId},{npcId},{unknownId1},{unknownId2}");
        }

        public void VendorPurchaseItem(int npcId, int slotId)
        {
            Send($"VPI{npcId},{slotId + 1}");
        }

        public void VendorSellItem(int npcId, int slotId, int stackSize)
        {
            Send($"VSI{npcId},{slotId + 1},{stackSize}");
        }

        public void GetItemDetails(int itemId)
        {
            Send($"GID{itemId}");
        }

        public void OpenCombineBag()
        {
            Send($"OCB");
        }

        public void DestroyItem(int slotId)
        {
            Send($"DITM{slotId + 1}");
        }

        public void DestroySpell(int slotId)
        {
            Send($"DSPL{slotId + 1}");
        }

        public void SwapSpellSlot(int fromSlotId, int toSlotId)
        {
            Send($"SWAP{fromSlotId + 1},{toSlotId + 1}");
        }

        public void Emote(int emoteId)
        {
            Send($"EMOT{emoteId}");
        }
    }
}
