let editor; // Make editor globally accessible for other scripts

document.addEventListener('DOMContentLoaded', () => {
    const codeEditorElement = document.getElementById('codeEditor');
    const runBtn = document.getElementById('runBtn');
    const outputArea = document.getElementById('output');
    let isUpdatingBySocket = false;

    try {
        editor = CodeMirror.fromTextArea(codeEditorElement, {
            lineNumbers: true,
            mode: 'python',
            theme: 'material-darker'
        });
    } catch (e) {
        console.error("Could not initialize CodeMirror:", e);
    }

    if (editor) {
        editor.on('change', () => {
            if (!isUpdatingBySocket) {
                socket.emit('code_changed', { room_id: ROOM_ID, code: editor.getValue() });
            }
        });
    }

    socket.on('code_update', (data) => {
        if (editor && data.code) {
            const cursorPos = editor.getCursor();
            isUpdatingBySocket = true;
            editor.setValue(data.code);
            isUpdatingBySocket = false;
            editor.setCursor(cursorPos);
        }
    });

    if (runBtn) {
        runBtn.addEventListener('click', async () => {
            if (!editor) return;
            
            outputArea.innerText = 'Running...';
            runBtn.disabled = true;
            try {
                const response = await fetch('/run-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code: editor.getValue() })
                });
                const result = await response.json();
                outputArea.innerText = response.ok ? result.output : `Error: ${result.error}`;
            } catch (error) {
                outputArea.innerText = `An unexpected error occurred: ${error.message}`;
            } finally {
                runBtn.disabled = false;
            }
        });
    }
});