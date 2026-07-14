namespace VirtualOffice.Api;

/// <summary>
/// Layout das salas de dev (uma por dev, nos cantos do mapa). Os tiles de mesa e de
/// quadro kanban DEVEM casar com office-unity/Assets/Scripts/Game/OfficeMap.cs — se mudar
/// aqui, mude lá. O servidor usa a mesa para o rastreio "sentou na mesa → conta horas".
/// </summary>
public static class OfficeLayout
{
    public record Desk(int RoomIndex, int DeskX, int DeskY, int KanbanX, int KanbanY);

    // 4 salas nos cantos. DeskX/Y = tile onde o dev SENTA (a mesa é desenhada logo acima,
    // contra a parede norte da sala); KanbanX/Y = quadro na parede norte. O dev senta
    // virado para cima, de frente para a mesa e o kanban.
    public static readonly Desk[] Desks =
    {
        new(0, 4, 4, 4, 1),    // cima-esquerda
        new(1, 31, 4, 31, 1),  // cima-direita
        new(2, 4, 18, 4, 15),  // baixo-esquerda
        new(3, 31, 18, 31, 15),// baixo-direita
    };

    public static Desk? ForIndex(int index) =>
        index >= 0 && index < Desks.Length ? Desks[index] : null;

    public static bool IsDeskTile(Desk? desk, int tileX, int tileY) =>
        desk is not null && desk.DeskX == tileX && desk.DeskY == tileY;
}
