using System;
using UnityEngine;
using UnityEngine.UIElements;
using OfficeQuest.Game;

namespace OfficeQuest.Ui
{
    /// <summary>
    /// Fábrica de componentes UI Toolkit (VisualElement) estilizados pelas classes de app.uss.
    /// Substitui o antigo uGUI hand-coded — layout por flexbox, aparência por USS (CSS do Unity).
    /// </summary>
    public static class UiKit
    {
        public static VisualElement Ve(params string[] classes)
        {
            var v = new VisualElement();
            foreach (var c in classes) if (!string.IsNullOrEmpty(c)) v.AddToClassList(c);
            return v;
        }

        public static VisualElement Row(params string[] classes)
        {
            var v = Ve("row"); foreach (var c in classes) if (!string.IsNullOrEmpty(c)) v.AddToClassList(c); return v;
        }

        public static Label Lbl(string text, params string[] classes)
        {
            var l = new Label(text ?? "");
            foreach (var c in classes) if (!string.IsNullOrEmpty(c)) l.AddToClassList(c);
            return l;
        }

        public static Button Btn(string text, Action onClick, params string[] classes)
        {
            var b = new Button(() => onClick?.Invoke()) { text = text };
            b.RemoveFromClassList("unity-button"); // tira o estilo default
            b.AddToClassList("btn");
            foreach (var c in classes) if (!string.IsNullOrEmpty(c)) b.AddToClassList(c);
            return b;
        }

        public static VisualElement Avatar(string name, string colorHex, string extra = null)
        {
            var a = Ve("avatar");
            if (!string.IsNullOrEmpty(extra)) a.AddToClassList(extra);
            a.style.backgroundColor = SoftArt.Hex(colorHex);
            var ini = Initials(name);
            a.Add(Lbl(ini));
            a.Q<Label>().style.color = Color.white;
            return a;
        }

        public static string Initials(string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return "?";
            var p = name.Trim().Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
            var s = ((p.Length > 0 ? p[0][0].ToString() : "") + (p.Length > 1 ? p[1][0].ToString() : ""));
            return string.IsNullOrEmpty(s) ? "?" : s.ToUpper();
        }

        public static VisualElement Badge(string text, string typeClass = null)
        {
            var b = Ve("badge");
            if (!string.IsNullOrEmpty(typeClass)) b.AddToClassList(typeClass);
            b.Add(Lbl(text));
            return b;
        }

        public static VisualElement Track(float pct01, Color? fill = null)
        {
            var t = Ve("track");
            var f = Ve("fill");
            f.style.width = Length.Percent(Mathf.Clamp01(pct01) * 100f);
            if (fill.HasValue) f.style.backgroundColor = fill.Value;
            t.Add(f);
            return t;
        }

        public static VisualElement Spacer()
        {
            var v = new VisualElement(); v.style.flexGrow = 1; return v;
        }

        public static void SetBg(this VisualElement v, string hex) => v.style.backgroundColor = SoftArt.Hex(hex);
    }
}
