package com.castlewinds;

/** Runs the unmodified mobile engine to export its actual Part I map geometry. */
public final class ExportMobileMaps {
    static String q(String s) { return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n") + "\""; }
    public static void main(String[] args) {
        Game game = new Game("Reference", Game.PLAYER_MALE, 1, new int[]{10,10,10,10}, 42);
        System.out.print("{\"seed\":42,\"levels\":[");
        for (int id=0;id<=12;id++) {
            if(id>0)game.travel(id,false);
            Game.Level m=game.map(); if(id>0)System.out.print(",");
            System.out.print("{\"id\":"+id+",\"name\":"+q(m.title)+",\"width\":"+m.w+",\"height\":"+m.h+",\"spawn\":{\"x\":"+(id==0?18:game.x)+",\"y\":"+(id==0?24:game.y)+"},\"up\":{\"x\":"+m.upX+",\"y\":"+m.upY+"},\"down\":{\"x\":"+m.downX+",\"y\":"+m.downY+"},\"tiles\":[");
            for(int y=0;y<m.h;y++)for(int x=0;x<m.w;x++){if(x+y>0)System.out.print(",");System.out.print(m.tiles[y][x]);}
            System.out.print("],\"decorations\":[");
            for(int i=0;i<m.decor.size();i++){Game.Decoration d=m.decor.get(i);if(i>0)System.out.print(",");System.out.print("{\"x\":"+d.x+",\"y\":"+d.y+",\"image\":\"bitmap-"+d.id+"\",\"width\":"+d.w+",\"height\":"+d.h+"}");}
            System.out.print("],\"places\":[");
            for(int i=0;i<m.places.size();i++){Game.Place p=m.places.get(i);if(i>0)System.out.print(",");System.out.print("{\"name\":"+q(p.name)+",\"sign\":"+q(p.sign)+",\"role\":"+q(p.role)+",\"x\":"+p.x+",\"y\":"+p.y+",\"width\":"+p.w+",\"height\":"+p.h+",\"doorX\":"+p.doorX+",\"doorY\":"+p.doorY+"}");}
            System.out.print("],\"enemies\":[");
            for(int i=0;i<m.enemies.size();i++){Game.Enemy e=m.enemies.get(i);if(i>0)System.out.print(",");System.out.print("{\"name\":"+q(e.name)+",\"icon\":"+e.icon+",\"x\":"+e.x+",\"y\":"+e.y+",\"boss\":"+e.boss+"}");}
            System.out.print("],\"loot\":[");
            for(int i=0;i<m.loot.size();i++){Game.Loot l=m.loot.get(i);if(i>0)System.out.print(",");System.out.print("{\"x\":"+l.x+",\"y\":"+l.y+",\"kind\":"+q(l.item.kind)+",\"icon\":"+l.item.icon+"}");}
            System.out.print("]}");
        }
        System.out.println("]}");
    }
}
