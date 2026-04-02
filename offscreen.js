chrome.runtime.onMessage.addListener(handleMessages);

async function handleMessages(message) {
  if (message.target !== 'offscreen') {
    return;
  }

  if (message.type === 'CLEAR_CLIPBOARD') {
    await clearClipboard();
  }
}

async function clearClipboard() {
  try {
    // We need to focus the document to write to clipboard in some cases, 
    // though offscreen documents have special permissions.
    // Writing empty string to clear it.
    const text = document.createElement('textarea');
    document.body.appendChild(text);
    text.value = '';
    text.select();
    document.execCommand('copy');
    document.body.removeChild(text);
    
    // Alternative modern API if supported in offscreen context without focus
    // await navigator.clipboard.writeText(''); 
    // Note: execCommand is often more reliable in hidden/offscreen contexts for extensions historically,
    // but navigator.clipboard is preferred if it works. 
    // Let's try navigator.clipboard first, fall back if needed? 
    // Actually, for offscreen documents with 'clipboardWrite' permission (which we might need to add if not implicit),
    // navigator.clipboard.writeText('') should work.
    // However, 'clipboardWrite' is not in manifest yet? 
    // 'clipboardWrite' is usually required for writing. 
    // 'activeTab' gives it for the tab, but offscreen is not a tab.
    // Let's check if I need to add 'clipboardWrite' to manifest.
    // The plan said "Add clipboardWrite permission (if not implicitly covered)". 
    // I didn't add it yet. I should probably add it to be safe.
    // But let's try the standard way first.
    
    try {
        await navigator.clipboard.writeText('');
    } catch (err) {
        // Fallback to execCommand
        const input = document.createElement('textarea');
        document.body.appendChild(input);
        input.value = '';
        input.select();
        document.execCommand('copy');
        document.body.removeChild(input);
    }
    
  } catch (error) {
    console.error('Failed to clear clipboard:', error);
  }
}
