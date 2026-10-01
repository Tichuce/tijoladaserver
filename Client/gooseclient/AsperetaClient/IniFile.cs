using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace AsperetaClient
{
    class IniFile
    {
        private string filePath;

        public Dictionary<string, Dictionary<string, string>> Sections { get; private set; }

        public IniFile(string filePath)
        {
            this.filePath = filePath;
            ReadFile();
        }

        private void ReadFile()
        {
            Sections = new Dictionary<string, Dictionary<string, string>>();

            string currentSection = null;
            foreach (var line in File.ReadAllLines(filePath))
            {
                if (string.IsNullOrWhiteSpace(line) || line[0] == ';') continue;

                if (line[0] == '[')
                {
                    currentSection = line.Substring(1, line.Length - 2);
                    Sections[currentSection] = new Dictionary<string, string>();
                    continue;
                }

                int equals = line.IndexOf('=');
                if (equals == -1) continue;

                string key = line.Substring(0, equals);
                string value = line.Substring(equals + 1, line.Length - equals - 1);
                Sections[currentSection][key] = value;

                //Console.WriteLine($"{currentSection} {key} = {value}");
            }
        }

        public void SaveFile()
        {
            using (var writer = new StreamWriter(filePath))
            {
                foreach (var section in Sections)
                {
                    writer.WriteLine($"[{section.Key}]");

                    foreach (var setting in section.Value)
                    {
                        writer.WriteLine($"{setting.Key}={setting.Value}");
                    }

                    writer.WriteLine();
                }
            }
        }

        public int GetInt(string section, string key)
        {
            return Convert.ToInt32(Sections[section][key]);
        }

        public bool GetBool(string section, string key, bool defaultValue = false)
        {
            if (Sections.TryGetValue(section, out Dictionary<string, string> sectionDict) && sectionDict.TryGetValue(key, out string value))
            {
                return value.ToLowerInvariant() == "true" || value == "1";
            }

            return defaultValue;
        }

        public void SetValue<T>(string section, string key, T value)
        {
            SetValue(section, key, value.ToString());
        }

        public void SetValue(string section, string key, string value)
        {
            if (!Sections.TryGetValue(section, out Dictionary<string, string> sectionDict))
            {
                sectionDict = new Dictionary<string, string>();
                Sections[section] = sectionDict;
            }

            sectionDict[key] = value;
        }

        public IEnumerable<int> GetCoords(string section, string key)
        {
            return Sections[section][key].Split(',').Select(o => Convert.ToInt32(o));
        }

        public Dictionary<string, string> this[string section]
        {
            get { return Sections[section]; }
        }
    }
}
