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
