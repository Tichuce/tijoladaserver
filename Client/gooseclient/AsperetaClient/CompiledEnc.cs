using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;

namespace AsperetaClient
{
    // Up, Right, Down, Left
    // NoWeapon, Unknown, Staff, Sword
    // Walk, Attack

    public enum AnimationOrder
    {
        WalkNoWeaponUp,
        Unknown01,
        WalkStaffUp,
        WalkSwordUp,
        WalkNoWeaponRight,
        Unknown02,
        WalkStaffRight,
        WalkSwordRight,
        WalkNoWeaponDown,
        Unknown03,
        WalkStaffDown,
        WalkSwordDown,
        WalkNoWeaponLeft,
        Unknown04,
        WalkStaffLeft,
        WalkSwordLeft,
        AttackNoWeaponUp,
        Unknown05,
        AttackStaffUp,
        AttackSwordUp,
        AttackNoWeaponRight,
        Unknown06,
        AttackStaffRight,
        AttackSwordRight,
        AttackNoWeaponDown,
        Unknown07,
        AttackStaffDown,
        AttackSwordDown,
        AttackNoWeaponLeft,
        Unknown08,
        AttackStaffLeft,
        AttackSwordLeft,
    }

    // NOTE: For Illutia this is different. Hand -> Eyes and Hand is at the end. (I think)
    public enum AnimationType
    {
        Body,
        Hair,
        Hand,
        Chest,
        Helm,
        Legs,
        Feet
    }

    public class CompiledAnimation
    {
        public AnimationType Type { get; set; }
        public int Id { get; set; }

        public int[] AnimationIndexes { get; private set; }

        public CompiledAnimation(AnimationType type, int id)
        {
            this.Type = type;
            this.Id = id;
            this.AnimationIndexes = new int[4 * 8];
        }
    }

    public class CompiledEnc
    {
        public List<CompiledAnimation> CompiledAnimations { get; private set; }

        public CompiledEnc(string file)
        {
            this.CompiledAnimations = new List<CompiledAnimation>();

            using (BinaryReader reader = new BinaryReader(File.Open(file, FileMode.Open)))
            {
                while (reader.BaseStream.Position < reader.BaseStream.Length)
                {
                    AnimationType type = (AnimationType)reader.ReadInt16() - 1;
                    int id = reader.ReadInt32();

                    var animation = new CompiledAnimation(type, id);

                    int length = 4;
                    // directions
                    for (int i = 0; i < length; i++)
                    {
                        for (int k = 0; k < 8; k++)
                        {
                            animation.AnimationIndexes[i * 8 + k] = reader.ReadInt32();
                        }
                    }

                    this.CompiledAnimations.Add(animation);
                }
            }
        }
    }
}
