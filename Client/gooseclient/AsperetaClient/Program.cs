using System;

namespace AsperetaClient
{
    class Program
    {
        static void Main(string[] args)
        {
            using (var client = new GameClient())
            {
                client.Run();
            }
        }
    }
}
