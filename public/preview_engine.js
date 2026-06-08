/**
 * public/preview_engine.js
 * Preview Engine — Renders markdown, code blocks, and Mermaid diagrams.
 * Used by the chat UI to display rich AI responses.
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Markdown renderer (lightweight, no external deps)
  // ---------------------------------------------------------------------------

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMarkdown(text) {
    if (!text || typeof text !== "string") return "";

    let html = text;

    // Code blocks (fenced)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (match, lang, code) {
      const language = lang || "text";
      const escaped = escapeHtml(code.trim());
      return '<div class="preview-code-block" data-lang="' + escapeHtml(language) + '">' +
        '<div class="preview-code-header"><span>' + escapeHtml(language) + '</span>' +
        '<button class="preview-copy-btn" onclick="window.AuraPreview.copyCode(this)">Copy</button></div>' +
        '<pre><code class="language-' + escapeHtml(language) + '">' + escaped + '</code></pre></div>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code class="preview-inline-code">$1</code>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h4 class="preview-h4">$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3 class="preview-h3">$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2 class="preview-h2">$1</h2>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Blockquotes
    html = html.replace(/^> (.+)$/gm, '<blockquote class="preview-blockquote">$1</blockquote>');

    // Unordered lists
    html = html.replace(/^[-*] (.+)$/gm, '<li class="preview-li">$1</li>');
    html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, function (match) {
      return '<ul class="preview-ul">' + match + '</ul>';
    });

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="preview-oli">$1</li>');

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr class="preview-hr">');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="preview-link">$1</a>');

    // Line breaks (preserve paragraphs)
    html = html.replace(/\n\n/g, '</p><p class="preview-p">');
    html = html.replace(/\n/g, '<br>');

    // Wrap in paragraph if not already wrapped
    if (!html.startsWith("<")) {
      html = '<p class="preview-p">' + html + '</p>';
    }

    return html;
  }

  // ---------------------------------------------------------------------------
  // Mermaid diagram renderer
  // ---------------------------------------------------------------------------

  let mermaidLoaded = false;
  let mermaidLoading = false;

  function loadMermaid(callback) {
    if (mermaidLoaded) {
      callback();
      return;
    }
    if (mermaidLoading) {
      // Wait for it
      const check = setInterval(function () {
        if (mermaidLoaded) {
          clearInterval(check);
          callback();
        }
      }, 100);
      return;
    }
    mermaidLoading = true;
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js";
    script.onload = function () {
      mermaidLoaded = true;
      mermaidLoading = false;
      if (window.mermaid) {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
        });
      }
      callback();
    };
    script.onerror = function () {
      mermaidLoading = false;
      console.warn("Failed to load Mermaid library");
      callback();
    };
    document.head.appendChild(script);
  }

  function renderMermaid(container) {
    if (!container) return;
    const mermaidBlocks = container.querySelectorAll(".preview-code-block[data-lang='mermaid']");
    if (mermaidBlocks.length === 0) return;

    loadMermaid(function () {
      if (!window.mermaid) return;
      mermaidBlocks.forEach(function (block, index) {
        const code = block.querySelector("code");
        if (!code) return;
        const diagramText = code.textContent;
        const renderDiv = document.createElement("div");
        renderDiv.className = "preview-mermaid";
        renderDiv.id = "mermaid-" + Date.now() + "-" + index;
        block.parentNode.replaceChild(renderDiv, block);

        window.mermaid.render(renderDiv.id, diagramText)
          .then(function (result) {
            renderDiv.innerHTML = result.svg;
          })
          .catch(function (err) {
            renderDiv.innerHTML = '<div class="preview-error">Diagram error: ' + escapeHtml(String(err.message || err)) + '</div>';
          });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Math (LaTeX) rendering hint
  // ---------------------------------------------------------------------------

  function renderMath(container) {
    if (!container || !window.katex) return;
    // Inline math: \( ... \)
    // Block math: \[ ... \]
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    textNodes.forEach(function (node) {
      const text = node.textContent;
      // Block math
      const blockMatch = text.match(/\\\[([\s\S]+?)\\\]/);
      if (blockMatch) {
        const span = document.createElement("span");
        span.className = "preview-math-block";
        try {
          window.katex.render(blockMatch[1].trim(), span, { displayMode: true });
        } catch (e) {
          span.textContent = blockMatch[0];
        }
        node.parentNode.replaceChild(span, node);
        return;
      }
      // Inline math
      const inlineMatch = text.match(/\\\((.+?)\\\)/);
      if (inlineMatch) {
        const span = document.createElement("span");
        span.className = "preview-math-inline";
        try {
          window.katex.render(inlineMatch[1].trim(), span, { displayMode: false });
        } catch (e) {
          span.textContent = inlineMatch[0];
        }
        node.parentNode.replaceChild(span, node);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Copy code helper
  // ---------------------------------------------------------------------------

  function copyCode(button) {
    const block = button.closest(".preview-code-block");
    if (!block) return;
    const code = block.querySelector("code");
    if (!code) return;
    const text = code.textContent;
    navigator.clipboard.writeText(text).then(function () {
      button.textContent = "Copied!";
      setTimeout(function () { button.textContent = "Copy"; }, 2000);
    }).catch(function () {
      button.textContent = "Failed";
      setTimeout(function () { button.textContent = "Copy"; }, 2000);
    });
  }

  // ---------------------------------------------------------------------------
  // Main render function
  // ---------------------------------------------------------------------------

  /**
   * Render an AI response text into a container element.
   * Handles: markdown, code blocks, mermaid diagrams, math (if KaTeX loaded).
   *
   * @param {HTMLElement} container - Target DOM element
   * @param {string} text - Raw AI response text
   * @param {Object} options - { mermaid: true, math: true }
   */
  function render(container, text, options) {
    if (!container) return;
    const opts = options || {};

    // Render markdown to HTML
    const html = renderMarkdown(text || "");
    container.innerHTML = html;

    // Render Mermaid diagrams if present
    if (opts.mermaid !== false) {
      renderMermaid(container);
    }

    // Render math if KaTeX is available
    if (opts.math !== false) {
      renderMath(container);
    }

    // Add rendered class for styling
    container.classList.add("preview-rendered");
  }

  /**
   * Render text and return HTML string (for use without DOM container).
   */
  function renderToHtml(text) {
    return renderMarkdown(text || "");
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.AuraPreview = {
    render: render,
    renderToHtml: renderToHtml,
    renderMarkdown: renderMarkdown,
    renderMermaid: renderMermaid,
    renderMath: renderMath,
    copyCode: copyCode,
    escapeHtml: escapeHtml,
  };
})();
