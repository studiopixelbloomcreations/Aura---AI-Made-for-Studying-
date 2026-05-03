(function () {
  "use strict";
  let panel;
  function ensure() {
    if (panel) return panel;
    panel = document.createElement("section");
    panel.className = "panel";
    panel.id = "examPanel";
    panel.innerHTML = '<h2>Exam Mode</h2><label class="field">Subject<select id="examSubject"><option>Mathematics</option><option>Science</option><option>English</option><option>History</option><option>Geography</option><option>ICT</option></select></label><label class="field">Term test<select id="examTerm"><option value="1">First term</option><option value="2">Second term</option><option value="3">Third term</option></select></label><button class="btn-primary" id="startExam">Start practice</button><div id="examQuestion"></div>';
    document.body.appendChild(panel);
    panel.querySelector("#startExam").addEventListener("click", start);
    return panel;
  }
  async function start() {
    const subject = panel.querySelector("#examSubject").value;
    const termTest = panel.querySelector("#examTerm").value;
    const box = panel.querySelector("#examQuestion");
    box.innerHTML = "<p>Loading questions...</p>";
    const res = await fetch("/exam-mode/fetch-papers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subject, termTest }) });
    const payload = await res.json();
    const data = payload.data || payload;
    const q = (data.questions || [])[0];
    box.innerHTML = q ? `<h3>${q.question}</h3>${q.options.map((o) => `<button class="chip">${o}</button>`).join("")}` : "<p>No questions found yet.</p>";
  }
  window.AevraExamUI = { toggle() { ensure().classList.toggle("open"); document.querySelector(".exam-mode-btn")?.classList.toggle("active"); } };
})();
