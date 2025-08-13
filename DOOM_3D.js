// Universal 3D Doom Benzeri Oyun (BRUCE firmware, ES5, M5StickC Plus 2)
// ESC ile çıkış yok, minimap küçük, B tuşu geri yok, A ateş, C sağa dön, düşman ve skor/can sistemi

var display = require("display");
var keyboard = require("keyboard");

var screenWidth = display.width();
var screenHeight = display.height();

// --- GAME CONSTANTS ---
var MAX_ENEMIES = 4;
var ENEMY_TYPES = [
  {color: display.color(255,0,0), speed: 0.05}, // Red, slow
  {color: display.color(0,0,255), speed: 0.09}  // Blue, fast
];
var PLAYER_BULLET_SPEED = 0.3;
var ENEMY_BULLET_SPEED = 0.18;
var ENEMY_SHOOT_INTERVAL = 1200; // ms
var MAP_SIZE = 12;
var LEVEL = 1;
var SCORE = 0;
var HEALTH = 3;
var BULLETS = 0;
var ENEMIES_LEFT = 0;
var EFFECT = null;
var EFFECT_TIME = 0;

// --- RANDOM MAP GENERATION ---
function randomMap() {
  var m = [];
  for (var y=0; y<MAP_SIZE; y++) {
    m[y] = [];
    for (var x=0; x<MAP_SIZE; x++) {
      if (y==0||y==MAP_SIZE-1||x==0||x==MAP_SIZE-1) m[y][x]=1;
      else if ((x%3==0 && y%2==0) || (x%4==1 && y%3==1 && random()>0.5)) m[y][x]=1;
      else m[y][x] = (random()>0.78)?1:0;
    }
  }
  // Oyuncu ve düşmanlar için boşluk aç
  m[1][1]=0; m[1][2]=0; m[2][1]=0;
  m[MAP_SIZE-2][MAP_SIZE-2]=0; m[MAP_SIZE-3][MAP_SIZE-2]=0; m[MAP_SIZE-2][MAP_SIZE-3]=0;
  return m;
}

// --- GAME STATE ---
var map = randomMap();
var mapWidth = map[0].length;
var mapHeight = map.length;
var posX = 1.5, posY = 1.5;
var dir = 0;
var fov = Math.PI/3;
var moveSpeed = 0.15;
var rotSpeed = Math.PI/16;
var playerBullets = [];
var enemies = [];
var GAME_START_TIME = 0;

function spawnEnemies(level) {
  enemies = [];
  var emptySpots = [];
  for (var y=1; y<mapHeight-1; y++) {
    for (var x=1; x<mapWidth-1; x++) {
      if (map[y][x]===0 && !(Math.abs(x+0.5-posX)<2 && Math.abs(y+0.5-posY)<2)) {
        emptySpots.push({x:x+0.5, y:y+0.5});
      }
    }
  }
  shuffle(emptySpots);
  var n = MAX_ENEMIES+level-1;
  var minDist = 2;
  for (var i=0; i<emptySpots.length && enemies.length<n; i++) {
    var spot = emptySpots[i];
    var tooClose = false;
    for (var j=0; j<enemies.length; j++) {
      var dx = enemies[j].x - spot.x;
      var dy = enemies[j].y - spot.y;
      if (Math.sqrt(dx*dx+dy*dy) < minDist) { tooClose = true; break; }
    }
    if (!tooClose) {
      var t = ENEMY_TYPES[enemies.length%ENEMY_TYPES.length];
      enemies.push({x:spot.x, y:spot.y, alive:true, color:t.color, speed:t.speed, lastShot:now(), canShoot:false});
    }
  }
  ENEMIES_LEFT = enemies.length;
}
function shuffle(a){for(var i=a.length-1;i>0;i--){var j=Math.floor(random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;}}

function resetGame() {
  map = randomMap();
  mapWidth = map[0].length;
  mapHeight = map.length;
  posX = 1.5; posY = 1.5; dir = 0;
  HEALTH = 3;
  LEVEL = 1;
  SCORE = 0;
  playerBullets = [];
  enemyBullets = [];
  spawnEnemies(LEVEL);
  GAME_START_TIME = now();
}

function nextLevel() {
  LEVEL++;
  map = randomMap();
  mapWidth = map[0].length;
  mapHeight = map.length;
  posX = 1.5; posY = 1.5; dir = 0;
  playerBullets = [];
  enemyBullets = [];
  spawnEnemies(LEVEL);
}

// Menü seçenekleri
var menuOptions = ["FIRE", "GO", "LEFT", "RIGHT", "ESC"];
var menuSelected = 0;

function drawMenu() {
    var btnY = screenHeight-18;
    var btnW = Math.floor((screenWidth-20)/menuOptions.length);
    var btnH = 16;
    for (var i=0; i<menuOptions.length; i++) {
        var x = 10 + i*btnW;
        var renk = (i==menuSelected) ? display.color(255,255,0) : display.color(40,40,80);
        display.drawFillRect(x, btnY, btnW-4, btnH, renk);
        display.setTextColor((i==menuSelected) ? display.color(0,0,0) : display.color(255,255,255));
        display.drawString(menuOptions[i], x+6, btnY+3);
    }
}

function drawEffect() {
  if (EFFECT && now()-EFFECT_TIME<180) {
    display.fill(EFFECT);
  }
}

function drawMenuOnly() {
    var btnY = screenHeight-18;
    var btnW = Math.floor((screenWidth-20)/menuOptions.length);
    var btnH = 16;
    // Menü kısmını hızlıca yenile (ekranı temizlemeden)
    for (var i=0; i<menuOptions.length; i++) {
        var x = 10 + i*btnW;
        var renk = (i==menuSelected) ? display.color(255,255,0) : display.color(40,40,80);
        display.drawFillRect(x, btnY, btnW-4, btnH, renk);
        display.setTextColor((i==menuSelected) ? display.color(0,0,0) : display.color(255,255,255));
        display.drawString(menuOptions[i], x+6, btnY+3);
    }
}

function drawScene() {
    drawEffect();
    display.fill(display.color(0,0,0));
    // Raycasting
    var wallDistances = [];
    for (var x = 0; x < screenWidth; x+=2) {
        var rayAngle = (dir - fov/2) + (x / screenWidth) * fov;
        var rayX = Math.cos(rayAngle);
        var rayY = Math.sin(rayAngle);
        var distance = 0;
        var hit = 0;
        var testX, testY;
        while (!hit && distance < 16) {
            distance += 0.05;
            testX = Math.floor(posX + rayX * distance);
            testY = Math.floor(posY + rayY * distance);
            if (testX < 0 || testX >= mapWidth || testY < 0 || testY >= mapHeight) {
                hit = 1; distance = 16;
            } else if (map[testY][testX] > 0) {
                hit = 1;
            }
        }
        wallDistances.push(distance);
        var wallHeight = Math.floor(screenHeight / (distance+0.1));
        var startY = Math.floor((screenHeight - wallHeight) / 2);
        var endY = startY + wallHeight;
        var col = display.color(80,80,80);
        if (distance < 2) col = display.color(200,200,200);
        else if (distance < 4) col = display.color(150,150,150);
        else if (distance < 8) col = display.color(100,100,100);
        display.drawLine(x, startY, x, endY, col);
    }
    // Enemies (only visible if not behind wall)
    for (var i=0; i<enemies.length; i++) {
      if (!enemies[i].alive) continue;
      var dx = enemies[i].x - posX;
      var dy = enemies[i].y - posY;
      var dist = Math.sqrt(dx*dx+dy*dy);
      var angle = Math.atan2(dy, dx) - dir;
      if (dist > 0.2 && Math.abs(angle) < fov/2) {
        var sx = Math.floor((0.5 + Math.tan(angle)/Math.tan(fov/2)/2) * screenWidth);
        var size = Math.floor(50/dist);
        if (size > 40) size = 40;
        if (size < 8) size = 8;
        var sy = Math.floor(screenHeight/2 - size/2);
        var rayIdx = Math.floor(sx/2);
        if (rayIdx >= 0 && rayIdx < wallDistances.length && dist < wallDistances[rayIdx]) {
          display.drawFillRect(sx-size/2, sy, size, size, enemies[i].color);
        }
      }
    }
    // Player bullets
    for (var j=0; j<playerBullets.length; j++) {
      if (!playerBullets[j].alive) continue;
      var bx = playerBullets[j].x;
      var by = playerBullets[j].y;
      var dx = bx - posX;
      var dy = by - posY;
      var dist = Math.sqrt(dx*dx+dy*dy);
      var angle = Math.atan2(dy, dx) - dir;
      if (dist > 0.2 && Math.abs(angle) < fov/2) {
        var sx = Math.floor((0.5 + Math.tan(angle)/Math.tan(fov/2)/2) * screenWidth);
        var size = 6;
        var sy = Math.floor(screenHeight/2 - size/2);
        var rayIdx = Math.floor(sx/2);
        if (rayIdx >= 0 && rayIdx < wallDistances.length && dist < wallDistances[rayIdx]) {
          display.drawFillRect(sx-size/2, sy, size, size, display.color(255,255,0));
        }
      }
    }
    // Minimap (top right)
    var mm = 4;
    var mmW = mapWidth*mm;
    var mmH = mapHeight*mm;
    var mmX = screenWidth-mmW-4;
    var mmY = 22;
    for (var my=0; my<mapHeight; my++) {
      for (var mx=0; mx<mapWidth; mx++) {
        var renk = map[my][mx]==1 ? display.color(100,100,100) : display.color(30,30,30);
        display.drawFillRect(mmX+mx*mm, mmY+my*mm, mm, mm, renk);
      }
    }
    // Player triangle (minimap)
    var px = mmX+posX*mm;
    var py = mmY+posY*mm;
    var len = 5;
    var ang = dir;
    var ax = px + Math.cos(ang)*len;
    var ay = py + Math.sin(ang)*len;
    var bx = px + Math.cos(ang+2.5)*len*0.7;
    var by = py + Math.sin(ang+2.5)*len*0.7;
    var cx = px + Math.cos(ang-2.5)*len*0.7;
    var cy = py + Math.sin(ang-2.5)*len*0.7;
    display.drawLine(px, py, ax, ay, display.color(0,255,0));
    display.drawLine(ax, ay, bx, by, display.color(0,255,0));
    display.drawLine(ax, ay, cx, cy, display.color(0,255,0));
    display.drawLine(bx, by, cx, cy, display.color(0,255,0));
    // Enemies minimap
    for (var i=0; i<enemies.length; i++) {
      if (enemies[i].alive) display.drawFillRect(mmX+enemies[i].x*mm-2, mmY+enemies[i].y*mm-2, 4, 4, enemies[i].color);
    }
    // HUD (top, no overlap)
    display.setTextColor(display.color(255,255,0));
    display.setTextSize(1);
    display.drawString("HEALTH: "+HEALTH+"  SCORE: "+SCORE+"  LEVEL: "+LEVEL, 5, 2);
    display.setTextColor(display.color(0,255,255));
    display.drawString("ENEMIES: "+ENEMIES_LEFT, 5, 13);
    drawMenu();
}

function canMove(nx, ny) {
    var mx = Math.floor(nx);
    var my = Math.floor(ny);
    if (mx < 0 || mx >= mapWidth || my < 0 || my >= mapHeight) return false;
    return map[my][mx] == 0;
}

function fire() {
  var bullet = {
    x: posX,
    y: posY,
    dx: Math.cos(dir),
    dy: Math.sin(dir),
    alive: true,
    created: now()
  };
  playerBullets.push(bullet);
}

function updateBullets() {
  var t = now();
  for (var i=0; i<playerBullets.length; i++) {
    if (!playerBullets[i].alive) continue;
    if (t - playerBullets[i].created > 5000) { playerBullets[i].alive = false; continue; }
    playerBullets[i].x += playerBullets[i].dx*PLAYER_BULLET_SPEED;
    playerBullets[i].y += playerBullets[i].dy*PLAYER_BULLET_SPEED;
    if (!canMove(playerBullets[i].x, playerBullets[i].y)) {
      playerBullets[i].alive = false;
      EFFECT = display.color(255,255,255); EFFECT_TIME = now();
      continue;
    }
    for (var j=0; j<enemies.length; j++) {
      if (!enemies[j].alive) continue;
      var dx = playerBullets[i].x - enemies[j].x;
      var dy = playerBullets[i].y - enemies[j].y;
      if (Math.abs(dx)<0.4 && Math.abs(dy)<0.4) {
        enemies[j].alive = false;
        playerBullets[i].alive = false;
        SCORE += 100;
        ENEMIES_LEFT--;
        EFFECT = display.color(255,0,0); EFFECT_TIME = now();
        break;
      }
    }
  }
}

function updateEnemies() {
  var t = now();
  for (var i=0; i<enemies.length; i++) {
    if (!enemies[i].alive) continue;
    var dx = posX - enemies[i].x;
    var dy = posY - enemies[i].y;
    var dist = Math.sqrt(dx*dx+dy*dy);
    if (dist < 0.5) {
      HEALTH--;
      enemies[i].alive = false;
      ENEMIES_LEFT--;
      EFFECT = display.color(255,0,0); EFFECT_TIME = now();
      if (HEALTH <= 0) { gameOver(); return; }
    } else if (dist < 6) {
      var step = enemies[i].speed;
      var ex = enemies[i].x + (dx>0?-step:step);
      var ey = enemies[i].y + (dy>0?-step:step);
      if (canMove(ex, ey)) {
        enemies[i].x = ex;
        enemies[i].y = ey;
      }
    }
  }
}

function gameOver() {
  display.fill(display.color(0,0,0));
  display.setTextColor(display.color(255,0,0));
  display.setTextSize(2);
  display.drawString("Game Over!", 30, screenHeight/2-10);
  display.setTextSize(1);
  display.setTextColor(display.color(255,255,0));
  display.drawString("Score: "+SCORE, 40, screenHeight/2+20);
  delay(3000);
  resetGame();
  spawnEnemies(LEVEL);
}

// --- MAIN MENU ---
function mainMenu() {
  display.fill(display.color(0,0,0));
  display.setTextColor(display.color(0,255,0));
  display.setTextSize(2);
  display.drawString("DOOM MINI 3D", 30, 30);
  display.setTextSize(1);
  display.setTextColor(display.color(255,255,0));
  display.drawString("Press A to Start", 40, 70);
  display.setTextColor(display.color(200,200,200));
  display.drawString("Use menu below to play", 20, 100);
  while (true) {
    if (keyboard.getSelPress()) { delay(200); break; }
    delay(10);
  }
}

function mainLoop() {
    var redraw = true;
    while (true) {
        var action = null;
        var menuMoved = false;
        // Sadece sanal tuş (A) ile seçili olanı uygula, sadece o zaman tam ekran redraw yap
        if (keyboard.getNextPress()) { menuSelected = (menuSelected + 1) % menuOptions.length; menuMoved = true; delay(60); }
        if (keyboard.getPrevPress()) { menuSelected = (menuSelected - 1 + menuOptions.length) % menuOptions.length; menuMoved = true; delay(60); }
        if (keyboard.getSelPress()) { action = menuOptions[menuSelected]; redraw = true; delay(60); }
        if (action == "FIRE") { fire(); }
        else if (action == "GO") {
            var nx = posX + Math.cos(dir) * moveSpeed;
            var ny = posY + Math.sin(dir) * moveSpeed;
            if (canMove(nx, ny)) { posX = nx; posY = ny; }
        } else if (action == "LEFT") {
            dir -= rotSpeed; if (dir < 0) dir += Math.PI*2;
        } else if (action == "RIGHT") {
            dir += rotSpeed; if (dir > Math.PI*2) dir -= Math.PI*2;
        } else if (action == "ESC") {
            display.fill(display.color(0,0,0));
            display.setTextColor(display.color(255,0,0));
            display.setTextSize(2);
            display.drawString("Byee!", 30, screenHeight/2-10);
            delay(2000);
            // BRUCE ana menüsüne dönmek için programı sonlandır
            return;
        }
        updateBullets();
        updateEnemies();
        if (ENEMIES_LEFT<=0) { nextLevel(); redraw = true; }
        if (redraw) { drawScene(); redraw = false; }
        else if (menuMoved) { drawMenuOnly(); }
        delay(5);
    }
}

// --- ANA OYUN DÖNGÜSÜ ---
function game() {
  while (true) {
    mainMenu();
    resetGame();
    drawScene();
    var result = mainLoop();
    if (result === undefined) break; // ESC ile çıkışta döngüden çık
  }
}

game();


