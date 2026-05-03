async function refreshLive(){
  try{
    const res = await fetch("/api/live");
    const data = await res.json();
    for(const [key,value] of Object.entries(data.stats || {})){
      document.querySelectorAll(`[data-live="${key}"]`).forEach(el => el.textContent = value);
    }
    const box = document.getElementById("leaderboardBox");
    if(box && data.leaderboard){
      box.innerHTML = data.leaderboard.map(u => `<div class="leader-row"><div><strong>#${u.rank} @${u.name}</strong><span>${u.time} active voice</span></div><b>${u.xp} XP</b></div>`).join("");
    }
  }catch(e){}
}
setInterval(refreshLive, 15000);


document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const id = btn.dataset.id;
    const field = btn.dataset.field;
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = "Saving...";
    try {
      const res = await fetch(`/api/security/${id}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const data = await res.json();
      btn.textContent = data.ok ? `${field}: ${data.value ? "ON" : "OFF"}` : "Failed";
      setTimeout(() => location.reload(), 700);
    } catch {
      btn.textContent = "Error";
    }
    setTimeout(() => {
      btn.disabled = false;
      btn.textContent = old;
    }, 1500);
  });
});


async function refreshEmbedLeaderboard() {
  const box = document.getElementById("discordEmbedLeaderboard");
  if (!box) return;
  try {
    const res = await fetch("/api/live");
    const data = await res.json();
    const list = box.querySelector(".embed-list");
    if (list && data.leaderboard) {
      list.innerHTML = data.leaderboard.slice(0, 10).map((u, index) => {
        const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "#" + (index + 1);
        const avatar = u.avatar ? `<img src="${u.avatar}" class="mini-avatar">` : `<span class="mini-avatar fallback">${String(u.name || "?").slice(0,1).toUpperCase()}</span>`;
        return `<div class="embed-rank-row"><div class="embed-rank-left"><span class="medal">${medal}</span>${avatar}<strong>@${u.name}</strong></div><div class="embed-rank-stats"><span>${u.time}</span><span>✨ ${u.xp} XP</span><span>💰 ${u.coins}</span></div></div>`;
      }).join("");
    }
    const updated = document.getElementById("embedUpdated");
    if (updated) updated.textContent = new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch {}
}
setInterval(refreshEmbedLeaderboard, 15000);
refreshEmbedLeaderboard();
