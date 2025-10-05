const myVideo = document.getElementById('myVideo');
const remoteVideos = document.getElementById('remoteVideos');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
let myStream;
const peerConnections = {};
const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

async function startMedia() {
  try {
    myStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    myVideo.srcObject = myStream;
  } catch (e) {
    console.error('Error accessing media devices.', e);
    alert('Could not access your camera or microphone. Please check permissions.');
  }
}

function createPeerConnection(remoteSid) {
  const pc = new RTCPeerConnection(config);
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { target_sid: remoteSid, signal_data: { type: 'ice-candidate', candidate: event.candidate } });
    }
  };
  pc.ontrack = (event) => {
    let remoteVideo = document.getElementById(`video-${remoteSid}`);
    if (!remoteVideo) {
      const wrapper = document.createElement('div');
      wrapper.id = `wrapper-${remoteSid}`;
      wrapper.className = 'video-wrapper';
      remoteVideo = document.createElement('video');
      remoteVideo.id = `video-${remoteSid}`;
      remoteVideo.autoplay = true;
      wrapper.appendChild(remoteVideo);
      remoteVideos.appendChild(wrapper);
    }
    remoteVideo.srcObject = event.streams[0];
  };
  myStream.getTracks().forEach(track => pc.addTrack(track, myStream));
  peerConnections[remoteSid] = pc;
  return pc;
}

socket.on('existing_participants', async (data) => {
  for (const remoteSid of data.sids) {
    const pc = createPeerConnection(remoteSid);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { target_sid: remoteSid, signal_data: { type: 'offer', sdp: pc.localDescription } });
  }
});

socket.on('signal', async (signal_data) => {
  const remoteSid = signal_data.sender_sid;
  const pc = peerConnections[remoteSid] || createPeerConnection(remoteSid);
  if (signal_data.type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(signal_data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('signal', { target_sid: remoteSid, signal_data: { type: 'answer', sdp: pc.localDescription } });
  } else if (signal_data.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(signal_data.sdp));
  } else if (signal_data.type === 'ice-candidate') {
    await pc.addIceCandidate(new RTCIceCandidate(signal_data.candidate));
  }
});

socket.on('user_left', ({ sid }) => {
  if (peerConnections[sid]) {
    peerConnections[sid].close();
    delete peerConnections[sid];
  }
  const remoteVideoWrapper = document.getElementById(`wrapper-${sid}`);
  if (remoteVideoWrapper) remoteVideoWrapper.remove();
});

toggleVideoBtn.addEventListener('click', () => {
  const track = myStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
  toggleVideoBtn.innerText = track.enabled ? 'Video On' : 'Video Off';
});
toggleAudioBtn.addEventListener('click', () => {
  const track = myStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  toggleAudioBtn.innerText = track.enabled ? 'Audio On' : 'Audio Off';
});