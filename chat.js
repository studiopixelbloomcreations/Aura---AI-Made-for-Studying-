// chat.js
(function(){
  function startLoadingAnimation(targetEl){
    let i = 0;
    const frames = ['Thinking…', 'Thinking…', 'Thinking…'];
    const timer = setInterval(()=>{
      i = (i + 1) % 3;
      const dots = i === 0 ? '…' : i === 1 ? '..' : '...';
      targetEl.textContent = 'Thinking' + dots;
    }, 450);
    return () => clearInterval(timer);
  }

  function initChat(ctx){
    const { state, elements, toast, appendMessage, saveChats, renderChats, renderActiveChat, createChat, generateTitle } = ctx;
    const { inputBox, sendBtn, messagesEl } = elements;

    function emit(name, detail){
      console.log('chat.js emitting event:', name, detail);
      try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) {}
    }

    function getMainModel(){
      try {
        return String(localStorage.getItem('main_model') || 'google/gemini-2.5-flash').trim() || 'google/gemini-2.5-flash';
      } catch (e) {
        return 'google/gemini-2.5-flash';
      }
    }

    async function ensurePuterReady(interactive){
      if(window.__VIS_TEST_USE_MOCK || navigator.onLine === false) return;
      if(!window.puter || !window.puter.ai) throw new Error('PUTER_NOT_LOADED');
      if(!window.puter.auth || !window.puter.auth.isSignedIn || !window.puter.auth.signIn) return;
      let signed = false;
      try { signed = !!(await window.puter.auth.isSignedIn()); } catch (e) {}
      if(!signed && interactive){
        await window.puter.auth.signIn({ attempt_temp_user_creation: true });
      }
    }

    function extractPuterText(resp){
      if(!resp) return '';
      if(typeof resp === 'string') return resp.trim();
      if(resp.message && typeof resp.message.content === 'string') return String(resp.message.content).trim();
      if(typeof resp.content === 'string') return String(resp.content).trim();
      return '';
    }

    async function sendMessage(){
      const text = (inputBox && inputBox.value || '').trim();
      if(!text) return;

      let chat = state.chats.find(c=>c.id===state.active);
      if(!chat){
        createChat('New Chat');
        chat = state.chats[0];
      }

      if(chat.messages.length===0){
        const t = await generateTitle(text);
        chat.title = t;
        saveChats();
        renderChats();
        renderActiveChat();
      }

      const langTag = state.language==='Sinhala' ? '[සිංහල]' : '[English]';
      const userText = langTag + ' ' + text;

      // Remember last-known email for backend progress sync
      try { localStorage.setItem('g9_email', 'guest@student.com'); } catch (e) {}

      // Points/session tracking hooks
      emit('g9:chat_context', { chatId: state.active, subject: state.subject });
      emit('g9:user_message', { chatId: state.active, subject: state.subject, text });

      chat.messages.push({role:'user',content:userText});
      appendMessage('user', userText);
      saveChats();
      inputBox.value='';

      chat.messages.push({role:'ai',content:'Thinking…'});
      appendMessage('ai','Thinking…');
      saveChats();
      renderChats();

      const lastBubble = messagesEl ? messagesEl.lastElementChild : null;
      const stopAnim = lastBubble ? startLoadingAnimation(lastBubble) : null;

      const history = (chat && Array.isArray(chat.messages))
        ? chat.messages
            .filter(m => m && (m.role === 'user' || m.role === 'ai') && m.content && m.content !== 'Thinking…')
            .slice(-20)
            .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: String(m.content).slice(0, 1200) }))
        : [];

      try {
        await ensurePuterReady(true);
        const systemPrompt =
          'You are Aura AI, a helpful study tutor for Grade 9 students. ' +
          'Keep answers accurate, clear, and practical. ' +
          'Current subject: ' + state.subject + '. ' +
          'Respond in ' + state.language + '.';
        const mainModel = getMainModel();
        const puterResp = await window.puter.ai.chat([{ role: 'system', content: systemPrompt }].concat(history), { model: mainModel });
        const lastAi = [...chat.messages].reverse().find(m=>m.role==='ai');
        const answer = extractPuterText(puterResp);

        if(!answer){
          throw new Error('INVALID_RESPONSE');
        }
        if(lastAi){
          lastAi.content = answer;
        } else {
          chat.messages.push({role:'ai',content:answer});
        }

        // Points/session tracking hooks
        emit('g9:ai_response', { chatId: state.active, subject: state.subject, text: answer });

        renderActiveChat();
        saveChats();
      } catch(e){
        const msg = '⚠️ Message failed to send. Please check your connection or try again later.';
        const lastAi = [...chat.messages].reverse().find(m=>m.role==='ai');
        if(lastAi){
          lastAi.content = msg;
        } else {
          chat.messages.push({role:'ai',content:msg});
        }
        renderActiveChat();
        saveChats();
        toast(msg, {duration: 5000});
      } finally {
        if(stopAnim) stopAnim();
      }
    }

    // Marks update confirmation (separate from AI reply, per requirements)
    window.addEventListener('g9:marks_updated', ()=>{
      try {
        const chat = state.chats.find(c=>c.id===state.active);
        if(!chat) return;
        const msg = '✅ Your marks have been successfully updated in the progress bar.';
        chat.messages.push({ role: 'ai', content: msg });
        appendMessage('ai', msg);
        saveChats();
        renderChats();
      } catch (e) {}
    });

    if(sendBtn) sendBtn.onclick = sendMessage;
    if(inputBox){
      inputBox.addEventListener('keydown',(e)=>{
        if(e.key==='Enter' && !e.shiftKey){
          e.preventDefault();
          sendMessage();
        }
      });
    }

    return { sendMessage };
  }

  window.Chat = { initChat };
})();

