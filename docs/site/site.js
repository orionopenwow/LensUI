// Live clock in the bar, and the theme pack switcher. Nothing else.
(function () {
  var clock = document.getElementById("clock");
  function tick() {
    var d = new Date();
    clock.textContent = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      "  " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    clock.setAttribute("datetime", d.toISOString());
  }
  tick();
  setInterval(tick, 15000);

  var shot = document.getElementById("pack-shot");
  var buttons = document.querySelectorAll(".pack");
  buttons.forEach(function (b) {
    b.addEventListener("click", function () {
      buttons.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      var pack = b.getAttribute("data-pack");
      var img = new Image();
      img.onload = function () {
        shot.style.opacity = "0";
        setTimeout(function () {
          shot.src = img.src;
          shot.alt = "The Lens desktop in the " + b.textContent.trim() + " theme pack.";
          shot.style.opacity = "1";
        }, 120);
      };
      img.src = "assets/desktop-" + pack + ".webp";
      document.documentElement.style.setProperty("--accent", b.getAttribute("data-accent"));
    });
  });
})();
