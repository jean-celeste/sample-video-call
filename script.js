import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.0.0/firebase-app.js';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, addDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBcq2eKJhCR9pnJRfbyoQlQeBDw3dLaMnM",
    authDomain: "capstone-66c71.firebaseapp.com",
    projectId: "capstone-66c71",
    storageBucket: "capstone-66c71.appspot.com",
    messagingSenderId: "870563062414",
    appId: "1:870563062414:web:25762f8ea13c8cfdf79fdf",
    measurementId: "G-7M6ZQ0GJH0"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

const startButton = document.getElementById('startButton');
const joinButton = document.getElementById('joinButton');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const muteAudioButton = document.getElementById('muteAudioBtn');
const muteVideoButton = document.getElementById('muteVideoBtn');
const endCallButton = document.getElementById('endCallBtn');
const chatBox = document.getElementById('chatBox');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');

let localStream;
let remoteStream;
let peerConnection;
let roomId;

startButton.onclick = startCall;
joinButton.onclick = joinCall;
muteAudioButton.onclick = toggleAudio;
muteVideoButton.onclick = toggleVideo;
endCallButton.onclick = endCall;
sendButton.onclick = sendMessage;

async function init() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        console.log('Local stream obtained:', localStream);
    } catch (error) {
        console.error('Error accessing media devices.', error);
        alert('Error accessing media devices: ' + error.message);
    }
}

window.onload = async () => {
    await init();
};

async function startCall() {
    try {
        roomId = Math.random().toString(36).substring(2, 15);
        await setupPeerConnection();
        alert(`Call started. Share this ID with the person you want to join: ${roomId}`);
    } catch (error) {
        console.error('Error starting call.', error);
        alert('Error starting call: ' + error.message);
    }
}

async function joinCall() {
    try {
        roomId = prompt('Enter the ID of the call you want to join:');
        if (!roomId) return;
        await setupPeerConnection(true);
    } catch (error) {
        console.error('Error joining call.', error);
        alert('Error joining call: ' + error.message);
    }
}

async function setupPeerConnection(isJoining = false) {
    const callDoc = doc(collection(firestore, 'calls'), roomId);
    const offerCandidates = collection(callDoc, 'offerCandidates');
    const answerCandidates = collection(callDoc, 'answerCandidates');

    peerConnection = new RTCPeerConnection(servers);

    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.ontrack = event => {
        [remoteStream] = event.streams;
        remoteVideo.srcObject = remoteStream;
    };

    peerConnection.onicecandidate = event => {
        if (event.candidate) {
            if (isJoining) {
                addDoc(answerCandidates, event.candidate.toJSON());
            } else {
                addDoc(offerCandidates, event.candidate.toJSON());
            }
        }
    };

    if (isJoining) {
        const callData = (await getDoc(callDoc)).data();
        const offerDescription = callData.offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offerDescription));

        const answerDescription = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answerDescription);

        const answer = {
            sdp: answerDescription.sdp,
            type: answerDescription.type
        };
        await updateDoc(callDoc, { answer });

        onSnapshot(offerCandidates, snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    peerConnection.addIceCandidate(candidate);
                }
            });
        });
    } else {
        const offerDescription = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offerDescription);

        const offer = {
            sdp: offerDescription.sdp,
            type: offerDescription.type
        };
        await setDoc(callDoc, { offer });

        onSnapshot(callDoc, snapshot => {
            const data = snapshot.data();
            if (!peerConnection.currentRemoteDescription && data?.answer) {
                const answerDescription = new RTCSessionDescription(data.answer);
                peerConnection.setRemoteDescription(answerDescription);
            }
        });

        onSnapshot(answerCandidates, snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    peerConnection.addIceCandidate(candidate);
                }
            });
        });
    }

    // Listen for new messages
    onSnapshot(callDoc, (snapshot) => {
        const data = snapshot.data();
        if (data && data.messages) {
            updateChatBox(data.messages);
        }
    });
}

function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            muteAudioButton.textContent = audioTrack.enabled ? 'Mute Audio' : 'Unmute Audio';
        }
    }
}

function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            muteVideoButton.textContent = videoTrack.enabled ? 'Mute Video' : 'Unmute Video';
        }
    }
}

async function endCall() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    if (roomId) {
        try {
            await deleteDoc(doc(firestore, 'calls', roomId));
        } catch (error) {
            console.error('Error deleting room document:', error);
        }
    }
    chatBox.innerHTML = '';
    alert('Call ended');
}

async function sendMessage() {
    if (!roomId) {
        alert('You must be in a call to send messages.');
        return;
    }
    const message = messageInput.value.trim();
    if (message) {
        const callDoc = doc(firestore, 'calls', roomId);
        const callData = (await getDoc(callDoc)).data();
        const messages = callData.messages || [];
        messages.push({ text: message, sender: 'Me', timestamp: new Date().toISOString() });
        await updateDoc(callDoc, { messages: messages });
        messageInput.value = '';
    }
}

function updateChatBox(messages) {
    chatBox.innerHTML = '';
    messages.forEach(msg => {
        const msgElement = document.createElement('div');
        msgElement.textContent = `${msg.sender}: ${msg.text}`;
        chatBox.appendChild(msgElement);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
}