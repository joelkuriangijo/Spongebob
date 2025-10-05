const mainContainer = document.getElementById('main-container');
const toggleEditorBtn = document.getElementById('toggleEditorBtn');
const joinOverlay = document.getElementById('join-overlay');
const joinBtn = document.getElementById('join-btn');
let isEditorVisible = false;

joinBtn.addEventListener('click', async () => {
  await startMedia();
  joinOverlay.style.display = 'none';
  socket.emit('join', { room_id: ROOM_ID });
});

if (USER_ROLE === 'teacher' && toggleEditorBtn) {
  toggleEditorBtn.addEventListener('click', () => {
    isEditorVisible = !isEditorVisible;
    socket.emit('toggle_editor_visibility', {
      room_id: ROOM_ID,
      is_visible: isEditorVisible
    });
  });
}

socket.on('editor_state_changed', (data) => {
  isEditorVisible = data.visible;
  if (isEditorVisible) {
    mainContainer.classList.add('editor-visible');
    if (toggleEditorBtn) toggleEditorBtn.innerText = 'Hide Editor';
  } else {
    mainContainer.classList.remove('editor-visible');
    if (toggleEditorBtn) toggleEditorBtn.innerText = 'Show Editor';
  }
  if (editor) {
    setTimeout(() => editor.refresh(), 100);
  }
});// In static/js/ui.js, replace the entire file content

document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const mainContainer = document.getElementById('main-container');
    const toggleEditorBtn = document.getElementById('toggleEditorBtn');
    const joinOverlay = document.getElementById('join-overlay');
    const joinBtn = document.getElementById('join-btn');
    const copyLinkBtn = document.getElementById('copyLinkBtn');
    let isEditorVisible = false;

    // --- Join Call Logic ---
    if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
            // Use window.startMedia() as it's defined globally in video.js
            await window.startMedia();
            joinOverlay.style.display = 'none';
            socket.emit('join', { room_id: ROOM_ID });
        });
    }

    // --- Improved Copy Link Logic (NEW) ---
    if (copyLinkBtn) {
        copyLinkBtn.addEventListener('click', () => {
            const meetingLink = window.location.href;

            // Check if the secure Clipboard API is available
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(meetingLink).then(() => {
                    // Provide user feedback on success
                    const originalText = copyLinkBtn.innerText;
                    copyLinkBtn.innerText = 'Copied!';
                    copyLinkBtn.disabled = true;
                    setTimeout(() => {
                        copyLinkBtn.innerText = originalText;
                        copyLinkBtn.disabled = false;
                    }, 2000);
                }).catch(err => {
                    console.error('Modern clipboard failed: ', err);
                    // Fallback if permission is denied or an error occurs
                    fallbackCopyTextToClipboard(meetingLink);
                });
            } else {
                // Fallback for older browsers or insecure contexts
                console.warn('Clipboard API not available. Using fallback.');
                fallbackCopyTextToClipboard(meetingLink);
            }
        });
    }

    // Fallback function to copy text using a prompt
    function fallbackCopyTextToClipboard(text) {
        window.prompt("Copy this link to share:", text);
    }


    // --- Host/Teacher Logic for Editor ---
    if (USER_ROLE === 'teacher' && toggleEditorBtn) {
        toggleEditorBtn.addEventListener('click', () => {
            isEditorVisible = !isEditorVisible;
            socket.emit('toggle_editor_visibility', {
                room_id: ROOM_ID,
                is_visible: isEditorVisible
            });
        });
    }

    // --- Editor State Change Listener for All Users ---
    socket.on('editor_state_changed', (data) => {
        isEditorVisible = data.visible;
        if (isEditorVisible) {
            mainContainer.classList.add('editor-visible');
            if (toggleEditorBtn) toggleEditorBtn.innerText = 'Hide Editor';
        } else {
            mainContainer.classList.remove('editor-visible');
            if (toggleEditorBtn) toggleEditorBtn.innerText = 'Show Editor';
        }
        // Use `typeof editor` to check if CodeMirror has loaded
        if (typeof editor !== 'undefined' && editor) {
            setTimeout(() => editor.refresh(), 100);
        }
    });
});