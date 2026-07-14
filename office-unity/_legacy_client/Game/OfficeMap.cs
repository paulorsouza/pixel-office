using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace OfficeQuest.Game
{
    /// <summary>
    /// Mapa do escritório em arte LimeZu (16px). 4 salas de dev nos cantos (cada uma com
    /// mesa nominal + quadro kanban), sala de reunião ao norte-centro, café ao sul-centro,
    /// e o open space no meio. A geometria das salas/mesas casa com backend/OfficeLayout.cs
    /// (se mudar aqui, mude lá). Posições trafegam em "server units" (28/tile).
    /// </summary>
    public static class OfficeMap
    {
        public const int W = 36;
        public const int H = 22;
        public const float TileSu = 28f;

        public static readonly HashSet<Vector2Int> Solids = new HashSet<Vector2Int>();
        public static readonly List<Vector2Int> SitSpots = new List<Vector2Int>();

        public struct Zone { public string Name; public int X, Y, Wd, Ht; }
        public static readonly Zone[] Zones =
        {
            new Zone { Name = "meeting", X = 13, Y = 1, Wd = 11, Ht = 6 },
            new Zone { Name = "coffee", X = 13, Y = 15, Wd = 11, Ht = 6 },
        };

        // salas de dev (casam com backend/OfficeLayout.cs). x0,y0,x1,y1 = paredes externas;
        // desk = tile onde o dev senta (mesa desenhada acima); door = tile de porta.
        private struct DevRoom { public int X0, Y0, X1, Y1, DeskX, DeskY, KanbanX, KanbanY, DoorX, DoorY; }
        private static readonly DevRoom[] DevRooms =
        {
            new DevRoom { X0 = 1, Y0 = 1, X1 = 8, Y1 = 6, DeskX = 4, DeskY = 4, KanbanX = 4, KanbanY = 1, DoorX = 8, DoorY = 4 },
            new DevRoom { X0 = 27, Y0 = 1, X1 = 34, Y1 = 6, DeskX = 31, DeskY = 4, KanbanX = 31, KanbanY = 1, DoorX = 27, DoorY = 4 },
            new DevRoom { X0 = 1, Y0 = 15, X1 = 8, Y1 = 20, DeskX = 4, DeskY = 18, KanbanX = 4, KanbanY = 15, DoorX = 8, DoorY = 18 },
            new DevRoom { X0 = 27, Y0 = 15, X1 = 34, Y1 = 20, DeskX = 31, DeskY = 18, KanbanX = 31, KanbanY = 15, DoorX = 27, DoorY = 18 },
        };

        // salas grandes (reunião / café): paredes externas + porta
        private struct Hall { public int X0, Y0, X1, Y1, DoorX, DoorY; }
        private static readonly Hall Meeting = new Hall { X0 = 13, Y0 = 1, X1 = 23, Y1 = 6, DoorX = 18, DoorY = 6 };
        private static readonly Hall Coffee = new Hall { X0 = 13, Y0 = 15, X1 = 23, Y1 = 20, DoorX = 18, DoorY = 15 };

        // blocos de piso "fill" do atlas (origem col,row + tamanho em tiles). A arte foi feita
        // para se repetir dentro do bloco, então amostramos por módulo (x%w, y%h) — tila sem
        // costura e sem o xadrez que quebrava a textura.
        private static readonly (int c, int r, int w, int h) FloorOpen = (13, 7, 3, 2);   // tan quente (open space)
        private static readonly (int c, int r, int w, int h) FloorDev = (10, 7, 3, 2);    // carpete cinza (salas de foco)
        private static readonly (int c, int r, int w, int h) FloorMeet = (13, 9, 3, 2);   // carpete oliva (reunião)
        private static readonly (int c, int r, int w, int h) FloorCoffee = (10, 11, 3, 2);// terracota (café)
        // parede = tijolo cinza sólido (sem a faixa branca de "cap" que estragava o mapa)
        private const int WallC = 1, WallR = 8;

        // ---------- conversões ----------
        public static Vector3 SuToWorld(float sx, float sy) =>
            new Vector3(sx / TileSu, (H * TileSu - sy) / TileSu, 0);

        public static Vector2 WorldToSu(Vector3 world) =>
            new Vector2(world.x * TileSu, (H - world.y) * TileSu);

        public static Vector3 TileCenterWorld(int tx, int ty) =>
            new Vector3(tx + .5f, H - 1 - ty + .5f, 0);

        private static float TileBottomWorldY(int ty) => H - 1 - ty;

        public static int Order(float worldY) => Mathf.RoundToInt(-worldY * 32);

        public static bool IsSolidSu(float sx, float sy) =>
            Solids.Contains(new Vector2Int(Mathf.FloorToInt(sx / TileSu), Mathf.FloorToInt(sy / TileSu)));

        public static string ZoneAtSu(float sx, float sy)
        {
            var tx = sx / TileSu;
            var ty = sy / TileSu;
            foreach (var z in Zones)
                if (tx >= z.X && tx < z.X + z.Wd && ty >= z.Y && ty < z.Y + z.Ht) return z.Name;
            return "";
        }

        // ---------- construção ----------
        private static readonly HashSet<Vector2Int> WallTiles = new HashSet<Vector2Int>();

        public static void Build(Transform parent, JArray desks)
        {
            Solids.Clear();
            SitSpots.Clear();
            WallTiles.Clear();

            CollectWalls();
            BuildFloor(parent);
            BuildWalls(parent);
            BuildFurniture(parent, desks);
            BuildLighting(parent);
        }

        // ---------- iluminação 2D (URP Light2D) ----------
        private static void BuildLighting(Transform parent)
        {
            var root = new GameObject("Lighting").transform;
            root.SetParent(parent, false);

            var g = new GameObject("GlobalLight2D");
            g.transform.SetParent(root, false);
            var gl = g.AddComponent<Light2D>();
            gl.lightType = Light2D.LightType.Global;
            gl.color = new Color(1.0f, 0.96f, 0.88f); // ambiente neutro-quente (não escurece demais)
            gl.intensity = 0.9f;

            // luzes quentes pontuais: mesas de dev + reunião + café dão poças aconchegantes
            foreach (var r in DevRooms) AddPoint(root, r.DeskX, r.DeskY - 1, 7f, 2.2f, new Color(1f, 0.82f, 0.55f));
            AddPoint(root, 18, 4, 8f, 2.0f, new Color(1f, 0.86f, 0.6f));
            AddPoint(root, 18, 18, 8f, 2.0f, new Color(1f, 0.78f, 0.5f));
        }

        private static void AddPoint(Transform parent, int tx, int ty, float radius, float intensity, Color color)
        {
            var go = new GameObject($"light-{tx}-{ty}");
            go.transform.SetParent(parent, false);
            var p = TileCenterWorld(tx, ty);
            go.transform.position = new Vector3(p.x, p.y, 0);
            var l = go.AddComponent<Light2D>();
            l.lightType = Light2D.LightType.Point;
            l.pointLightInnerRadius = radius * 0.3f;
            l.pointLightOuterRadius = radius;
            l.intensity = intensity;
            l.color = color;
        }

        private static void Wall(int x, int y)
        {
            WallTiles.Add(new Vector2Int(x, y));
            Solids.Add(new Vector2Int(x, y));
        }

        private static void CollectWalls()
        {
            // borda do mapa
            for (var x = 0; x < W; x++) { Wall(x, 0); Wall(x, H - 1); }
            for (var y = 0; y < H; y++) { Wall(0, y); Wall(W - 1, y); }

            foreach (var r in DevRooms) CollectRoomWalls(r.X0, r.Y0, r.X1, r.Y1, r.DoorX, r.DoorY);
            CollectRoomWalls(Meeting.X0, Meeting.Y0, Meeting.X1, Meeting.Y1, Meeting.DoorX, Meeting.DoorY);
            CollectRoomWalls(Coffee.X0, Coffee.Y0, Coffee.X1, Coffee.Y1, Coffee.DoorX, Coffee.DoorY);
        }

        private static void CollectRoomWalls(int x0, int y0, int x1, int y1, int doorX, int doorY)
        {
            for (var x = x0; x <= x1; x++)
            {
                if (!(x == doorX && y0 == doorY)) Wall(x, y0);
                if (!(x == doorX && y1 == doorY)) Wall(x, y1);
            }
            for (var y = y0; y <= y1; y++)
            {
                if (!(x0 == doorX && y == doorY)) Wall(x0, y);
                if (!(x1 == doorX && y == doorY)) Wall(x1, y);
            }
        }

        private static bool Inside(int x, int y, int x0, int y0, int x1, int y1) =>
            x > x0 && x < x1 && y > y0 && y < y1;

        private static (int c, int r, int w, int h) FloorBlockFor(int x, int y)
        {
            foreach (var d in DevRooms)
                if (Inside(x, y, d.X0, d.Y0, d.X1, d.Y1)) return FloorDev;
            if (Inside(x, y, Meeting.X0, Meeting.Y0, Meeting.X1, Meeting.Y1)) return FloorMeet;
            if (Inside(x, y, Coffee.X0, Coffee.Y0, Coffee.X1, Coffee.Y1)) return FloorCoffee;
            return FloorOpen;
        }

        private static void BuildFloor(Transform parent)
        {
            var root = new GameObject("Floor").transform;
            root.SetParent(parent, false);
            for (var y = 0; y < H; y++)
                for (var x = 0; x < W; x++)
                {
                    if (WallTiles.Contains(new Vector2Int(x, y))) continue; // parede desenha próprio chão
                    var b = FloorBlockFor(x, y);
                    var tile = LimeArt.RbTile(b.c + Mod(x, b.w), b.r + Mod(y, b.h)); // amostra sem costura
                    var pos = TileCenterWorld(x, y);
                    Spawn(root, $"f{x}-{y}", tile, pos.x, pos.y, -5000);
                }
        }

        private static int Mod(int a, int n) => ((a % n) + n) % n;

        private static void BuildWalls(Transform parent)
        {
            var root = new GameObject("Walls").transform;
            root.SetParent(parent, false);
            var wallSprite = LimeArt.RbTile(WallC, WallR);
            foreach (var s in WallTiles)
            {
                var pos = TileCenterWorld(s.x, s.y);
                Spawn(root, $"w{s.x}-{s.y}", wallSprite, pos.x, pos.y, Order(TileBottomWorldY(s.y)));
            }
        }

        // ---------- mobília ----------
        private static void BuildFurniture(Transform parent, JArray desks)
        {
            var root = new GameObject("Furniture").transform;
            root.SetParent(parent, false);

            // ----- salas de dev -----
            for (var i = 0; i < DevRooms.Length; i++)
            {
                var r = DevRooms[i];
                // mesa (2 tiles) contra a parede norte, logo acima do assento
                PlaceSingleSolid(root, 227, r.DeskX - 1, r.DeskY - 1);
                // cadeira do dev = ponto de sentar (a mesa dele)
                PlaceChair(root, r.DeskX, r.DeskY);
                // quadro kanban na parede norte
                PlaceWall(root, 171, r.KanbanX, r.KanbanY);
                // planta no canto
                PlaceSolidSingle(root, 99, r.X0 + 1, r.Y1 - 1);
                // placa flutuante com o nome do dev, acima da parede norte da sala
                var name = desks != null && i < desks.Count ? (string)desks[i]["name"] : $"Sala {i + 1}";
                var color = desks != null && i < desks.Count ? (string)desks[i]["color"] : "#ffffff";
                Nameplate(root, $"Sala de {name}", color, (r.X0 + r.X1) / 2f, r.Y0);
            }

            // ----- reunião: mesa de conferência (208) + cadeiras -----
            for (var x = 15; x <= 21; x++) { Solid(x, 3); Solid(x, 4); }
            Place(root, 208, 15, 4); Place(root, 208, 17, 4); Place(root, 208, 19, 4);
            for (var x = 15; x <= 21; x++) { PlaceChair(root, x, 2); PlaceChair(root, x, 5); }
            PlaceWall(root, 172, 18, 1);                         // quadro
            PlaceSolidSingle(root, 273, 14, 5);                 // estação de fones (feature headset)

            // ----- café: balcão + lounge -----
            for (var x = 15; x <= 20; x++) Solid(x, 16);
            Place(root, 321, 15, 16); Place(root, 320, 17, 16); Place(root, 323, 19, 16);
            PlaceSolidSingle(root, 175, 21, 16);               // vending
            PlaceBench(root, 15, 19); PlaceBench(root, 18, 19);
            PlaceSolidSingle(root, 100, 21, 19);               // planta

            // ----- open space: algumas plantas e um bebedouro -----
            PlaceSolidSingle(root, 99, 10, 8);
            PlaceSolidSingle(root, 100, 25, 8);
            PlaceSolidSingle(root, 317, 10, 13);
            PlaceSolidSingle(root, 98, 25, 13);
        }

        // ---------- helpers ----------
        private static void Solid(int tx, int ty) => Solids.Add(new Vector2Int(tx, ty));

        private static void Place(Transform parent, int number, int tileX, int tileY)
        {
            var w = LimeArt.SingleWidth(number);
            var centerX = tileX + w / 2f;
            var baseY = TileBottomWorldY(tileY);
            ContactShadow(parent, centerX, baseY, w * .95f, Order(baseY));
            Spawn(parent, $"s{number}-{tileX}-{tileY}", LimeArt.Single(number), centerX, baseY, Order(baseY));
        }

        /// <summary>Sombra de contato elíptica no chão, logo abaixo do móvel (dá profundidade).</summary>
        private static void ContactShadow(Transform parent, float centerX, float baseY, float widthTiles, int order)
        {
            var go = new GameObject("shadow");
            go.transform.SetParent(parent, false);
            go.transform.position = new Vector3(centerX, baseY + .1f, 0);
            go.transform.localScale = new Vector3(Mathf.Max(.6f, widthTiles), .5f, 1);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = SoftArt.GroundShadow();
            sr.sortingOrder = order - 1; // acima do piso, abaixo do próprio móvel
            GameLit.Apply(sr);
        }

        private static void PlaceSolid(Transform parent, int number, int tileX, int tileY)
        {
            var w = LimeArt.SingleWidth(number);
            for (var i = 0; i < w; i++) Solid(tileX + i, tileY);
            Place(parent, number, tileX, tileY);
        }

        // versão de 1 tile (marca o próprio tile) — nome curto para props
        private static void PlaceSolidSingle(Transform parent, int number, int tileX, int tileY) =>
            PlaceSolid(parent, number, tileX, tileY);

        /// <summary>Mesa 2-tiles sólida ocupando as 2 linhas do corpo acima do assento.</summary>
        private static void PlaceSingleSolid(Transform parent, int number, int tileX, int tileY)
        {
            Solid(tileX, tileY); Solid(tileX + 1, tileY);
            Solid(tileX, tileY - 1); Solid(tileX + 1, tileY - 1);
            Place(parent, number, tileX, tileY);
        }

        private static void PlaceChair(Transform parent, int tileX, int tileY)
        {
            SitSpots.Add(new Vector2Int(tileX, tileY));
            var baseY = TileBottomWorldY(tileY);
            ContactShadow(parent, tileX + .5f, baseY, .7f, Order(baseY) - 1);
            Spawn(parent, $"chair-{tileX}-{tileY}", LimeArt.Single(101), tileX + .5f, baseY, Order(baseY) - 1);
        }

        private static void PlaceBench(Transform parent, int tileX, int tileY)
        {
            Place(parent, 193, tileX, tileY);
            SitSpots.Add(new Vector2Int(tileX, tileY));
            SitSpots.Add(new Vector2Int(tileX + 1, tileY));
        }

        private static void PlaceWall(Transform parent, int number, int tileX, int tileY)
        {
            var w = LimeArt.SingleWidth(number);
            var centerX = tileX + w / 2f;
            var pos = TileCenterWorld(tileX, tileY);
            Spawn(parent, $"wall-{number}-{tileX}-{tileY}", LimeArt.Single(number), centerX, pos.y,
                Order(TileBottomWorldY(tileY)) + 1);
        }

        private static void Nameplate(Transform parent, string name, string colorHex, float centerX, int wallRow)
        {
            var go = new GameObject($"plate-{name}");
            go.transform.SetParent(parent, false);
            var y = TileCenterWorld(0, wallRow).y + .75f; // flutua acima da parede
            go.transform.position = new Vector3(centerX + .5f, y, 0);
            var tm = go.AddComponent<TextMesh>();
            tm.text = name;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.alignment = TextAlignment.Center;
            tm.characterSize = .07f;
            tm.fontSize = 40;
            tm.color = SoftArt.Hex(colorHex);
            tm.font = Ui.Hud.UiFont;
            var mr = go.GetComponent<MeshRenderer>();
            mr.material = tm.font.material;
            mr.sortingOrder = 15000;
        }

        private static void Spawn(Transform parent, string name, Sprite sprite, float worldX, float worldY, int order)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.position = new Vector3(worldX, worldY, 0);
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = sprite;
            sr.sortingOrder = order;
            GameLit.Apply(sr); // recebe Light2D
        }
    }
}
