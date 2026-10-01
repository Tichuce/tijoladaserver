using System;
using System.Collections.Generic;
using System.Data;
using System.Data.Common;
using System.Data.SQLite;

namespace AsperetaClient.Scripting.GameData;

public class GameDatabase
{
    private string connectionString = "Data Source=AsperetaGoose.db; Version=3;";
    private DbConnection connection;

    public GameDatabase()
    {
        connection = CreateDbConnection();
    }

    private DbConnection CreateDbConnection()
    {
        try
        {
            var connection = new SQLiteConnection($"{connectionString} FailIfMissing=True;");
            connection.Open();
            return connection;
        }
        catch
        {
            return CreateDatabase();
        }
    }

    private DbConnection CreateDatabase()
    {
        var connection = new SQLiteConnection(connectionString);
        connection.Open();

        string sql = CsvToSql.Core.CsvToSqlConverter.Convert("1CfWkDz0-3VLVPXEzwio-zvrfL2cV3KZD1KlmFww657I");
        ExecuteSql(connection, sql);

        return connection;
    }

    private void ExecuteSql(DbConnection connection, string sqlFile)
    {
        using var command = connection.CreateCommand();
        command.CommandText = sqlFile;
        command.ExecuteNonQuery();
    }

    public IReadOnlyCollection<WarpTile> GetWarpTiles(int mapNumber, string mapName)
    {
        using var command = connection.CreateCommand();
        command.CommandText = @"
            WITH map AS (
                SELECT *
                FROM maps
                WHERE map_name = @MapName AND 
                      map_filename = @MapFileName
                ORDER BY map_id
                LIMIT 1
            )
            SELECT warptiles.map_id,
                   warptiles.map_x,
                   warptiles.map_y,
                   warptiles.warp_id,
                   warptiles.warp_x,
                   warptiles.warp_y
            FROM warptiles
            INNER JOIN map ON map.map_id = warptiles.map_id";
        command.Parameters.Add(new SQLiteParameter("@MapName", DbType.String) { Value = mapName });
        command.Parameters.Add(new SQLiteParameter("@MapFileName", DbType.String) { Value = $"Map{mapNumber}.map" });

        using var reader = command.ExecuteReader();

        var warpTiles = new List<WarpTile>();
        while (reader.Read())
        {
            var warpTile = new WarpTile(
                Convert.ToInt32(reader["map_x"]) - 1,
                Convert.ToInt32(reader["map_y"]) - 1,
                Convert.ToInt32(reader["warp_id"]),
                Convert.ToInt32(reader["warp_x"]) - 1,
                Convert.ToInt32(reader["warp_y"]) - 1);
            warpTiles.Add(warpTile);
        }

        return warpTiles;
    }
}

public record WarpTile(int X, int Y, int DestinationMapId, int DestinationX, int DestinationY);