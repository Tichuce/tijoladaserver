using System;
using System.Collections.Generic;

namespace AsperetaClient
{
    public abstract class PacketHandler
    {
        public abstract string Prefix { get; }

        public List<Action<object>> Observers = new List<Action<object>>();

        public abstract object Parse(PacketParser p);

        public virtual void CallObservers(object obj)
        {
            for (int i = 0; i < Observers.Count; i++)
            {
                Observers[i].Invoke(obj);
            }
        }
    }

    public class PacketManager
    {
        private Dictionary<string, PacketHandler> handlers = new Dictionary<string, PacketHandler>();
        private Dictionary<Type, PacketHandler> typeToHandler = new Dictionary<Type, PacketHandler>();

        public void Listen<T>(Action<object> callback) where T : PacketHandler, new()
        {
            PacketHandler handler = null;
            if (!typeToHandler.TryGetValue(typeof(T), out handler))
            {
                handler = new T();
                handlers[handler.Prefix] = handler;
                typeToHandler[typeof(T)] = handler;
            }

            handler.Observers.Add(callback);
        }

        public void Remove<T>(Action<object> callback) where T : PacketHandler, new()
        {
            typeToHandler[typeof(T)].Observers.Remove(callback);
        }

        public void Handle(string packet)
        {
            if (packet.Length == 0) return;

            for (int i = 0; i < Math.Min(8, packet.Length); i++)
            {
                if (handlers.TryGetValue(packet.Substring(0, i + 1), out PacketHandler handler))
                {
                    object obj;
                    try
                    {
                        obj = handler.Parse(new PacketParser(packet, handler.Prefix));
                    }
                    catch (Exception e)
                    {
                        Console.WriteLine($"Exception handling packet '{packet}': {e}");
                        return;
                    }

                    handler.CallObservers(obj);

                    return;
                }
            }

            Console.WriteLine($"Can't handle packet: {packet}");
        }
    }

    public class PacketParser
    {
        private string packet;
        private string prefix;
        private int index;

        public char Delimeter { get; set; } = ',';

        public PacketParser(string packet, string prefix)
        {
            this.packet = packet;
            this.prefix = prefix;
            this.index = prefix.Length;
        }

        public string GetWholePacket()
        {
            return packet;
        }

        public string GetRemaining()
        {
            if (index >= packet.Length)
                throw new InvalidOperationException($"Index {index} is out of bounds for packet {prefix}");

            return packet.Substring(index);
        }

        private string GetNextToken()
        {
            if (index >= packet.Length)
                throw new InvalidOperationException($"Index {index} is out of bounds for packet {prefix}");

            string strValue = null;

            for (int i = index; i < packet.Length; i++)
            {
                if (packet[i] == Delimeter)
                {
                    strValue = packet.Substring(index, i - index);
                    index = i + 1;
                    break;
                }
            }

            if (strValue == null)
            {
                strValue = packet.Substring(index);
                index = packet.Length;
            }

            //Console.WriteLine(strValue);

            return strValue;
        }

        public int GetInt32()
        {
            return Convert.ToInt32(GetNextToken());
        }

        public long GetInt64()
        {
            return Convert.ToInt64(GetNextToken());
        }

        public bool GetBool()
        {
            return GetNextToken() != "0";
        }

        public string GetString()
        {
            return GetNextToken();
        }

        public string GetSubstring(int length)
        {
            if (index + length >= packet.Length)
                throw new InvalidOperationException($"Substring is out of bounds for packet {prefix}");

            string result = packet.Substring(index, length);
            index += length;
            return result;
        }

        public char Peek()
        {
            return packet[index];
        }

        public int LengthRemaining()
        {
            if (index >= packet.Length)
                return 0;
            
            return packet.Length - index;
        }
    }
}
