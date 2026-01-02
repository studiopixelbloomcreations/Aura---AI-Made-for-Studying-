// mic.js
(function(){
  function initMic(ctx){
    const { state, elements, toast } = ctx;
    const { inputBox, micBtn } = elements;

    let recognition = null;

    if('webkitSpeechRecognition' in window || 'SpeechRecognition' in window){
      const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognition = new Rec();
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => {
        if(micBtn) micBtn.classList.add('recording');
      };

      recognition.onend = () => {
        if(micBtn) micBtn.classList.remove('recording');
      };

      recognition.onresult = (ev) => {
        const t = (ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || '';
        if(inputBox){
          inputBox.value = t;
          inputBox.focus();
          // Ensure downstream UI reacts exactly like typed input.
          try { inputBox.dispatchEvent(new Event('input', { bubbles: true })); } catch (e) {}
        }
      };

      recognition.onerror = () => {
        if(micBtn) micBtn.classList.remove('recording');
        toast('Speech recognition error');
      };
    }

    function start(){
      if(!recognition){
        toast('Speech recognition not supported');
        return;
      }
      recognition.lang = state.language==='Sinhala' ? 'si-LK' : 'en-US';
      try {
        recognition.start();
      } catch (e) {
        toast('Speech recognition error');
      }
    }

    if(micBtn) micBtn.onclick = start;

    return { start };
  }

  window.Mic = { initMic };
})();
