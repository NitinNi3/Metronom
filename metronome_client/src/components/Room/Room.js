import React, { useState, useEffect, useRef } from 'react';
import Peer from 'simple-peer';
import styled from 'styled-components';
import socket from '../../socket';
import VideoCard from '../Video/VideoCard';
import BottomBar from '../BottomBar/BottomBar';
import Chat from '../Chat/Chat';

const Room = (props) => {
  // currentUser = username
  const currentUser = sessionStorage.getItem('user');

  const [peers, setPeers] = useState([]);
  const [userVideoAudio, setUserVideoAudio] = useState({
    localUser: { video: true, audio: true },
  });
  const [videoDevices, setVideoDevices] = useState([]);
  // nc
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(0);
  const [showAudioDevices, setShowAudioDevices] = useState(false);

  const [displayChat, setDisplayChat] = useState(false);
  const [screenShare, setScreenShare] = useState(false);
  const [showVideoDevices, setShowVideoDevices] = useState(false);
  

  const peersRef = useRef([]);
  const userVideoRef = useRef();
  const screenTrackRef = useRef();
  const userStream = useRef();
  const roomId = props.match.params.roomId;

  useEffect(() => {

    // Get Video-Audio Devices
    const getSetDevices = () => {
      navigator.mediaDevices.enumerateDevices().then((devices) => {

        // nc
        const uniqueDevices = [];
        const audioDevices = devices.filter((device) =>{

          if(device.kind === 'audioinput'){
            return true
          }
          // for unique devices by groupId

          // if(device.kind === 'audioinput' && uniqueDevices.indexOf(device.groupId) === -1){
          //   uniqueDevices.push(device.groupId)
          //   return true
          // }

        }
        );
        setAudioDevices(audioDevices)
        
        //
        setSelectedAudioDeviceId(audioDevices[0].deviceId)
  
        console.table(audioDevices)
  
        const filtered = devices.filter((device) => device.kind === 'videoinput');
        setVideoDevices(filtered);
      });
    }

    // Set Back Button Event
    window.addEventListener('popstate', goToBack);

    // nc
    navigator.mediaDevices.ondevicechange = (event) => {
      setSelectedAudioDeviceId(0)
      navigator.mediaDevices.enumerateDevices().then((devices) => {
        const audioDevices = devices.filter((device) => device.kind === 'audioinput');
        let selectedAudioDeviceisInList = true;
        audioDevices.map((device)=>{
          if(device.deviceId !== selectedAudioDeviceId){
            selectedAudioDeviceisInList = false
          }else{
            selectedAudioDeviceisInList = true
          }
        });
        if(!selectedAudioDeviceisInList) setSelectedAudioDeviceId(0)
        setAudioDevices(audioDevices);
        const filtered = devices.filter((device) => device.kind === 'videoinput');
        setVideoDevices(filtered);
      });
    };

    // Ask user to Connect Camera & Mic
    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        getSetDevices();
        userVideoRef.current.srcObject = stream;
        userStream.current = stream;

        socket.emit('BE-join-room', { roomId, userName: currentUser });
        socket.on('FE-user-join', (users) => {
          // all users
          console.log("ALL users in user-join", users)
          const peers = [];
          users.forEach(({ userId, info }) => {
            let { userName, video, audio } = info;

            if (userName !== currentUser) {
              const peer = createPeer(userId, socket.id, stream);

              peer.userName = userName;
              peer.peerID = userId;

              peersRef.current.push({
                peerID: userId,
                peer,
                userName,
              });
              peers.push(peer);

              setUserVideoAudio((preList) => {
                return {
                  ...preList,
                  [peer.userName]: { video, audio },
                };
              });
              // console.log("userVideoAudio", userVideoAudio)
            }
          });

          setPeers(peers);
        });

        socket.on('FE-receive-call', ({ signal, from, info }) => {
          let { userName, video, audio } = info;
          const peerIdx = findPeer(from);

          if (!peerIdx) {
            const peer = addPeer(signal, from, stream);

            peer.userName = userName;

            peersRef.current.push({
              peerID: from,
              peer,
              userName: userName,
            });
            setPeers((users) => {
              return [...users, peer];
            });
            setUserVideoAudio((preList) => {
              return {
                ...preList,
                [peer.userName]: { video, audio },
              };
            });
          }
        });

        socket.on('FE-call-accepted', ({ signal, answerId }) => {
          const peerIdx = findPeer(answerId);
          peerIdx.peer.signal(signal);
        });

        socket.on('FE-user-leave', ({ userId, userName }) => {
          peerLeave(userId)
        });
      });

    socket.on('FE-toggle-camera', ({ userId, switchTarget }) => {
      const peerIdx = findPeer(userId);

      setUserVideoAudio((preList) => {
        let video = preList[peerIdx.userName].video;
        let audio = preList[peerIdx.userName].audio;

        if (switchTarget === 'video') video = !video;
        else audio = !audio;

        return {
          ...preList,
          [peerIdx.userName]: { video, audio },
        };
      });
    });

    socket.on('Peer-stats-change',(statsData)=>{
      const statsType = statsData.type;
      if(statsType === 'audio-quality'){
        const audioquality = statsData.audioQuality;
        // Setting up the Audio Quality at UI
      }else{
        // statsType = Ping Quality (good if less than 30 or 50 and bad if more than 150)
        const netQuality = statsData.ping; // good,working,bad
        // Setting up the Net Quality at UI

      }
    });
    // user disconnect not using right now
    socket.on('socket-disconnected',(socketId)=>{
      console.log("User : ",socketId," is disconnected")
      removePeer(socketId)
    })

    return () => {
      console.log("OK SOCKET DISCONNECTING ..........")
      socket.disconnect();
    };
    // eslint-disable-next-line
  }, []);

  // stats
  function audioQaulityChange(roomId,audioData) {
    socket.emit('My-AudioQuality-Change',audioData)
  }
  // stats
  function netQaulityChange(roomId,pingData) {
    socket.emit('My-Ping-Change',pingData)

  }

  function createPeer(userId, caller, stream) {
    const peer = new Peer({
      initiator: true,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('BE-call-user', {
        userToCall: userId,
        from: caller,
        signal,
      });
    });
    peer.on('disconnect', () => {
      peer.destroy();
    });

    return peer;
  }

  function removePeer(userId){
    // const peerIdx = findPeer(userId);
    // peerIdx.peer.destroy();
    setPeers((users) => {
      users = users.filter((user) => user.peerID !== userId);
      return [...users];
    });
    peersRef.current = peersRef.current.filter(({ peerID }) => peerID !== userId );
  }

  function peerLeave(userId){
    const peerIdx = findPeer(userId);
    if(peerIdx){
      peerIdx.peer.destroy();
      setPeers((users) => {
        users = users.filter((user) => user.peerID !== peerIdx.peer.peerID);
        return [...users];
      }); 
    }
    peersRef.current = peersRef.current.filter(({ peerID }) => peerID !== userId );
  }

  function addPeer(incomingSignal, callerId, stream) {
    const peer = new Peer({
      initiator: false,
      trickle: false,
      stream,
    });

    peer.on('signal', (signal) => {
      socket.emit('BE-accept-call', { signal, to: callerId });
    });

    peer.on('disconnect', () => {
      peer.destroy();
    });

    peer.signal(incomingSignal);

    return peer;
  }

  function findPeer(id) {
    return peersRef.current.find((p) => p.peerID === id);
  }

  function createUserVideo(peer, index, arr) {
    return (
      <VideoBox
        className={`width-peer${peers.length > 8 ? '' : peers.length}`}
        onClick={expandScreen}
        key={index}
      >
        {writeUserName(peer.userName)}
        <FaIcon className='fas fa-expand' />
        <VideoCard key={index} peer={peer} number={arr.length} />
      </VideoBox>
    );
  }

  function writeUserName(userName, index) {
    if (userVideoAudio.hasOwnProperty(userName)) {
      if (!userVideoAudio[userName].video) {
        return <UserName key={userName}>{userName}</UserName>;
      }
    }
  }

  // Open Chat
  const clickChat = (e) => {
    e.stopPropagation();
    setDisplayChat(!displayChat);
  };

  // BackButton
  const goToBack = (e) => {
    e.preventDefault();
    socket.emit('BE-leave-room', { roomId, leaver: currentUser });
    sessionStorage.removeItem('user');
    window.location.href = '/';
  };

  const toggleCameraAudio = (e) => {
    const target = e.target.getAttribute('data-switch');
    console.log("toogle audio:",target)

    setUserVideoAudio((preList) => {
      let videoSwitch = preList['localUser'].video;
      let audioSwitch = preList['localUser'].audio;

      console.log("audioSwitch:",audioSwitch)

      if (target === 'video') {
        const userVideoTrack = userVideoRef.current.srcObject.getVideoTracks()[0];
        videoSwitch = !videoSwitch;
        userVideoTrack.enabled = videoSwitch;
      } else {
        const userAudioTrack = userVideoRef.current.srcObject.getAudioTracks()[0];
        audioSwitch = !audioSwitch;

        if (userAudioTrack) {
          userAudioTrack.enabled = audioSwitch;
        } else {
          userStream.current.getAudioTracks()[0].enabled = audioSwitch;
        }
      }

      return {
        ...preList,
        localUser: { video: videoSwitch, audio: audioSwitch },
      };
    });

    socket.emit('BE-toggle-camera-audio', { roomId, switchTarget: target });
  };

  const clickScreenSharing = () => {
    if (!screenShare) {
      navigator.mediaDevices
        .getDisplayMedia({ cursor: true })
        .then((stream) => {
          const screenTrack = stream.getTracks()[0];

          peersRef.current.forEach(({ peer }) => {
            // replaceTrack (oldTrack, newTrack, oldStream);
              console.log("TTTTTTTTTt:",peer)
              peer.replaceTrack(
                peer.streams[0].getTracks().find((track) => track.kind === 'video'),
                screenTrack,
                userStream.current
              )
          });

          // Listen click end
          screenTrack.onended = () => {
            peersRef.current.forEach(({ peer }) => {
              peer.replaceTrack(
                screenTrack,
                peer.streams[0]
                  .getTracks()
                  .find((track) => track.kind === 'video'),
                userStream.current
              );
            });
            userVideoRef.current.srcObject = userStream.current;
            setScreenShare(false);
          };

          userVideoRef.current.srcObject = stream;
          screenTrackRef.current = screenTrack;
          setScreenShare(true);
        });
    } else {
      screenTrackRef.current.onended();
    }
  };

  const expandScreen = (e) => {
    const elem = e.target;

    if (elem.requestFullscreen) {
      elem.requestFullscreen();
    } else if (elem.mozRequestFullScreen) {
      /* Firefox */
      elem.mozRequestFullScreen();
    } else if (elem.webkitRequestFullscreen) {
      /* Chrome, Safari & Opera */
      elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
      /* IE/Edge */
      elem.msRequestFullscreen();
    }
  };

  const clickBackground = () => {
    if(showVideoDevices) setShowVideoDevices(false);

    if (showAudioDevices) setShowAudioDevices(false);
  };

  const clickCameraDevice = (event) => {
    if (event && event.target && event.target.dataset && event.target.dataset.value) {
      const deviceId = event.target.dataset.value;
      const enabledAudio = userVideoRef.current.srcObject.getAudioTracks()[0].enabled;

      navigator.mediaDevices
        .getUserMedia({ video: { deviceId }, audio: enabledAudio })
        .then((stream) => {
          const newStreamTrack = stream.getTracks().find((track) => track.kind === 'video');
          const oldStreamTrack = userStream.current
            .getTracks()
            .find((track) => track.kind === 'video');

          userStream.current.removeTrack(oldStreamTrack);
          userStream.current.addTrack(newStreamTrack);

          peersRef.current.forEach(({ peer }) => {
            // replaceTrack (oldTrack, newTrack, oldStream);
            peer.replaceTrack(
              oldStreamTrack,
              newStreamTrack,
              userStream.current
            );
          });
        });
    }
  };

  // nc
  const clickAudioDevice = (event) => {
    setUserVideoAudio((preList) => {
      let videoSwitch = preList['localUser'].video;
      let audioSwitch = preList['localUser'].audio;
      return {
      ...preList,
      localUser: { video: videoSwitch, audio: true },};
    })
    if (event && event.target && event.target.dataset && event.target.dataset.value) {
      const deviceId = event.target.dataset.value;
      setSelectedAudioDeviceId(deviceId)
      const enabledAudio = userVideoRef.current.srcObject.getAudioTracks()[0].enabled;

      navigator.mediaDevices
        .getUserMedia({audio: { deviceId,enabledAudio }})
        .then((stream) => {
          
          const newStreamTrack = stream.getTracks().find((track) => track.kind === 'audio');
          
          const oldStreamTrack = userStream.current
            .getTracks()
            .find((track) => track.kind === 'audio');

          userStream.current.removeTrack(oldStreamTrack);
          userStream.current.addTrack(newStreamTrack);
          

          peersRef.current.forEach(({ peer }) => {
            // replaceTrack (oldTrack, newTrack, oldStream);
            peer.replaceTrack(
              oldStreamTrack,
              newStreamTrack,
              userStream.current
            );
            
          });
        })
        .catch((error)=>{
          console.log(error)
        });
    }
  };

  // nc update clickAudioDevice function with below ut not in use here
  const switchAudioSource = (audioDeviceId) => {

    setSelectedAudioDeviceId(audioDeviceId)
    const enabledAudio = userVideoRef.current.srcObject.getAudioTracks()[0].enabled;

    navigator.mediaDevices
        .getUserMedia({audio: { audioDeviceId,enabledAudio }})
        .then((stream) => {
          
          const newStreamTrack = stream.getTracks().find((track) => track.kind === 'audio');
          
          const oldStreamTrack = userStream.current
            .getTracks()
            .find((track) => track.kind === 'audio');

          userStream.current.removeTrack(oldStreamTrack);
          userStream.current.addTrack(newStreamTrack);
          

          peersRef.current.forEach(({ peer }) => {
            // replaceTrack (oldTrack, newTrack, oldStream);
            peer.replaceTrack(
              oldStreamTrack,
              newStreamTrack,
              userStream.current
            );
            
          });
        }).catch((error)=>{
          console.log(error)
        });



  }

  return (
    <RoomContainer onClick={clickBackground}>
      <VideoAndBarContainer>
        <VideoContainer>
          {/* Current User Video */}
          <VideoBox
            className={`width-peer${peers.length > 8 ? '' : peers.length}`}
          >
            {userVideoAudio['localUser'].video ? null : (
              <UserName>{currentUser}</UserName>
            )}
            <FaIcon className='fas fa-expand' />
            <MyVideo
              onClick={expandScreen}
              ref={userVideoRef}
              muted
              autoPlay
              playInline
            ></MyVideo>
          </VideoBox>
          {/* Joined User Vidoe */}
          {peers &&
            peers.map((peer, index, arr) => createUserVideo(peer, index, arr))}
        </VideoContainer>
        <BottomBar
          clickScreenSharing={clickScreenSharing}
          clickChat={clickChat}
          clickCameraDevice={clickCameraDevice}
          clickAudioDevice={clickAudioDevice}// nc
          goToBack={goToBack}
          toggleCameraAudio={toggleCameraAudio}
          userVideoAudio={userVideoAudio['localUser']}
          screenShare={screenShare}
          videoDevices={videoDevices}
          showVideoDevices={showVideoDevices}
          setShowVideoDevices={setShowVideoDevices}
          selectedAudioDeviceId={selectedAudioDeviceId}// nc
          audioDevices={audioDevices}// nc
          showAudioDevices={showAudioDevices}// nc
          setShowAudioDevices={setShowAudioDevices}// nc
        />
      </VideoAndBarContainer>
      <Chat display={displayChat} roomId={roomId} />
    </RoomContainer>
  );
};

const RoomContainer = styled.div`
  display: flex;
  width: 100%;
  max-height: 100vh;
  flex-direction: row;
`;

const VideoContainer = styled.div`
  max-width: 100%;
  height: 92%;
  display: flex;
  flex-direction: row;
  justify-content: space-around;
  flex-wrap: wrap;
  align-items: center;
  padding: 15px;
  box-sizing: border-box;
  gap: 10px;
`;

const VideoAndBarContainer = styled.div`
  position: relative;
  width: 100%;
  height: 100vh;
`;

const MyVideo = styled.video``;

const VideoBox = styled.div`
  position: relative;
  display: flex;
  justify-content: center;
  align-items: center;
  > video {
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  :hover {
    > i {
      display: block;
    }
  }
`;

const UserName = styled.div`
  position: absolute;
  font-size: calc(20px + 5vmin);
  z-index: 1;
`;

const FaIcon = styled.i`
  display: none;
  position: absolute;
  right: 15px;
  top: 15px;
`;

export default Room;