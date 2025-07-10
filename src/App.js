import React, { useState, useEffect, useCallback } from 'react';

// Firebase 관련 모듈들을 가져옵니다.
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider, // Google 로그인 제공자
  signInWithPopup,    // 팝업을 통한 로그인
  signOut             // 로그아웃
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  updateDoc,
  deleteDoc,
  getDocs
} from 'firebase/firestore';

// ============================================================================
// !!! 중요: 이 부분에 실제 Firebase 프로젝트 설정을 입력해야 합니다 !!!
// Firebase 콘솔에서 웹 앱을 추가할 때 제공되는 구성 객체를 사용하세요.
// Canvas 환경이 아닌 로컬에서 실행 시 필수입니다.
const firebaseConfig = {
  apiKey: "AIzaSyAX6lMMBj-DSQVhWgx5DekOj2R_4fgObLE", // 실제 API 키로 변경하세요
  authDomain: "aliceclass-609e2.firebaseapp.com", // 실제 authDomain으로 변경하세요
  projectId: "aliceclass-609e2", // 실제 프로젝트 ID로 변경하세요
  storageBucket: "YOUR_PROJECT_ID.appspot.com", // 실제 storageBucket으로 변경하세요
  messagingSenderId: "102197172945 ", // 실제 messagingSenderId로 변경하세요
  appId: "1:102197172945:web:93f8ce70845bfb18bf83f0" // 실제 앱 ID로 변경하세요
};

// Firestore 경로에 사용될 앱 ID (위의 firebaseConfig.projectId와 동일하게 설정)
const appId = firebaseConfig.projectId;
// ============================================================================

// Firebase 앱 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 재사용 가능한 모달 컴포넌트
const Modal = ({ show, type, message, onConfirm, onClose, children }) => {
  if (!show) return null;

  return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full text-center">
          {type === 'message' && (
              <>
                <p className="text-lg mb-4">{message}</p>
                <button
                    onClick={onClose}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
                >
                  확인
                </button>
              </>
          )}
          {type === 'confirm' && (
              <>
                <p className="text-lg mb-4">{message}</p>
                <div className="flex justify-center space-x-4">
                  <button
                      onClick={onConfirm}
                      className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
                  >
                    삭제
                  </button>
                  <button
                      onClick={onClose}
                      className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
                  >
                    취소
                  </button>
                </div>
              </>
          )}
          {type === 'custom' && children}
        </div>
      </div>
  );
};

// 메인 App 컴포넌트
const App = () => {
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [newQuestionText, setNewQuestionText] = useState('');
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [newAnswerText, setNewAnswerText] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    type: 'message',
    message: '',
    onConfirm: null,
    children: null
  });

  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingAnswer, setEditingAnswer] = useState(null);

  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState(false);

  const openModal = useCallback((config) => {
    setModalConfig(config);
    setShowModal(true);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setModalConfig({ type: 'message', message: '', onConfirm: null, children: null });
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("구글 로그인 오류:", error);
      let errorMessage = "구글 로그인 중 알 수 없는 오류가 발생했습니다.";
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = "로그인 팝업이 닫혔습니다.";
      } else if (error.code === 'auth/cancelled-popup-request') {
        errorMessage = "이미 진행 중인 로그인 요청이 있습니다.";
      } else if (error.message) {
        errorMessage = `구글 로그인 중 오류가 발생했습니다: ${error.message}`;
      }
      openModal({ type: 'message', message: errorMessage });
    }
  }, [openModal]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      setSelectedQuestion(null);
      openModal({ type: 'message', message: "로그아웃되었습니다." });
    } catch (error) {
      console.error("로그아웃 오류:", error);
      openModal({ type: 'message', message: `로그아웃 중 오류가 발생했습니다: ${error.message}` });
    }
  }, [openModal]);

  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(
        collection(db, `artifacts/${appId}/public/data/questions`),
        orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const questionsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setQuestions(questionsData);
    }, (error) => {
      console.error("질문을 불러오는 중 오류 발생:", error);
      openModal({ type: 'message', message: "질문을 불러오는 중 오류가 발생했습니다." });
    });

    return () => unsubscribe();
  }, [isAuthReady, appId, openModal]);

  const handlePostQuestion = useCallback(async () => {
    if (!user) {
      openModal({ type: 'message', message: "질문을 게시하려면 로그인해야 합니다." });
      return;
    }
    if (newQuestionText.trim() === '') {
      openModal({ type: 'message', message: "질문을 입력해주세요." });
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/questions`), {
        text: newQuestionText,
        userId: user.uid,
        userName: user.displayName || user.email,
        timestamp: serverTimestamp(),
      });
      setNewQuestionText('');
      openModal({ type: 'message', message: "질문이 성공적으로 게시되었습니다." });
    } catch (e) {
      console.error("질문 추가 중 오류 발생: ", e);
      openModal({ type: 'message', message: "질문 게시 중 오류가 발생했습니다." });
    }
  }, [user, newQuestionText, openModal, appId]);

  const handleEditQuestion = useCallback((question) => {
    setEditingQuestion(question);
    openModal({
      type: 'custom',
      children: (
          <>
            <h2 className="text-xl font-semibold mb-4">질문 수정</h2>
            <textarea
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3 resize-y"
                rows="4"
                value={editingQuestion?.text || ''}
                onChange={(e) => setEditingQuestion(prev => ({ ...prev, text: e.target.value }))}
            ></textarea>
            <div className="flex justify-center space-x-4">
              <button
                  onClick={async () => {
                    if (!editingQuestion?.text.trim()) {
                      openModal({ type: 'message', message: "질문을 입력해주세요." });
                      return;
                    }
                    try {
                      const questionRef = doc(db, `artifacts/${appId}/public/data/questions`, editingQuestion.id);
                      await updateDoc(questionRef, { text: editingQuestion.text });
                      closeModal();
                      setEditingQuestion(null);
                      openModal({ type: 'message', message: "질문이 성공적으로 수정되었습니다." });
                    } catch (e) {
                      console.error("질문 업데이트 중 오류 발생: ", e);
                      openModal({ type: 'message', message: "질문 수정 중 오류가 발생했습니다." });
                    }
                  }}
                  className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
              >
                저장
              </button>
              <button
                  onClick={() => { closeModal(); setEditingQuestion(null); }}
                  className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out"
              >
                취소
              </button>
            </div>
          </>
      )
    });
  }, [openModal, closeModal, editingQuestion, appId]);

  const handleDeleteQuestion = useCallback((questionId) => {
    openModal({
      type: 'confirm',
      message: "정말로 이 질문을 삭제하시겠습니까? 관련 답변도 모두 삭제됩니다.",
      onConfirm: async () => {
        try {
          const answersQuery = query(collection(db, `artifacts/${appId}/public/data/questions/${questionId}/answers`));
          const answersSnapshot = await getDocs(answersQuery);
          const deletePromises = answersSnapshot.docs.map(ansDoc => deleteDoc(doc(db, `artifacts/${appId}/public/data/questions/${questionId}/answers`, ansDoc.id)));
          await Promise.all(deletePromises);

          await deleteDoc(doc(db, `artifacts/${appId}/public/data/questions`, questionId));
          setSelectedQuestion(null);
          openModal({ type: 'message', message: "질문이 성공적으로 삭제되었습니다." });
        } catch (e) {
          console.error("질문 삭제 중 오류 발생: ", e);
          openModal({ type: 'message', message: "질문 삭제 중 오류가 발생했습니다." });
        } finally {
          closeModal();
        }
      }
    });
  }, [openModal, closeModal, appId]);

  useEffect(() => {
    if (!isAuthReady || !selectedQuestion) return;

    const q = query(
        collection(db, `artifacts/${appId}/public/data/questions/${selectedQuestion.id}/answers`),
        orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const answersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSelectedQuestion(prev => ({ ...prev, answers: answersData }));
    }, (error) => {
      console.error("답변을 불러오는 중 오류 발생:", error);
      openModal({ type: 'message', message: "답변을 불러오는 중 오류가 발생했습니다." });
    });

    return () => unsubscribe();
  }, [isAuthReady, selectedQuestion?.id, appId, openModal]);

  const handlePostAnswer = useCallback(async () => {
    if (!user) {
      openModal({ type: 'message', message: "답변을 게시하려면 로그인해야 합니다." });
      return;
    }
    if (newAnswerText.trim() === '') {
      openModal({ type: 'message', message: "답변을 입력해주세요." });
      return;
    }
    if (!selectedQuestion) {
      openModal({ type: 'message', message: "답변할 질문을 선택해주세요." });
      return;
    }

    try {
      await addDoc(collection(db, `artifacts/${appId}/public/data/questions/${selectedQuestion.id}/answers`), {
        text: newAnswerText,
        userId: user.uid,
        userName: user.displayName || user.email,
        timestamp: serverTimestamp()
      });
      setNewAnswerText('');
      openModal({ type: 'message', message: "답변이 성공적으로 게시되었습니다." });
    } catch (e) {
      console.error("답변 추가 중 오류 발생: ", e);
      openModal({ type: 'message', message: "답변 게시 중 오류가 발생했습니다." });
    }
  }, [user, newAnswerText, selectedQuestion, openModal, appId]);

  const handleEditAnswer = useCallback((answer) => {
    setEditingAnswer(answer);
  }, []);

  const handleUpdateAnswer = useCallback(async () => {
    if (!editingAnswer?.text.trim()) {
      openModal({ type: 'message', message: "답변을 입력해주세요." });
      return;
    }
    try {
      const answerRef = doc(db, `artifacts/${appId}/public/data/questions/${selectedQuestion.id}/answers`, editingAnswer.id);
      await updateDoc(answerRef, { text: editingAnswer.text });
      setEditingAnswer(null);
      openModal({ type: 'message', message: "답변이 성공적으로 수정되었습니다." });
    } catch (e) {
      console.error("답변 업데이트 중 오류 발생: ", e);
      openModal({ type: 'message', message: "답변 수정 중 오류가 발생했습니다." });
    }
  }, [editingAnswer, selectedQuestion, openModal, appId]);

  const handleDeleteAnswer = useCallback((answerId) => {
    openModal({
      type: 'confirm',
      message: "정말로 이 답변을 삭제하시겠습니까?",
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, `artifacts/${appId}/public/data/questions/${selectedQuestion.id}/answers`, answerId));
          openModal({ type: 'message', message: "답변이 성공적으로 삭제되었습니다." });
        } catch (e) {
          console.error("답변 삭제 중 오류 발생: ", e);
          openModal({ type: 'message', message: "답변 삭제 중 오류가 발생했습니다." });
        } finally {
          closeModal();
        }
      }
    });
  }, [openModal, closeModal, selectedQuestion, appId]);

  const handleGenerateAnswerDraft = useCallback(async () => {
    if (!selectedQuestion) {
      openModal({ type: 'message', message: "답변 초안을 생성할 질문을 먼저 선택해주세요." });
      return;
    }
    setIsGeneratingAnswer(true);
    setNewAnswerText('');

    try {
      const prompt = `다음 질문에 대해 자세하고 도움이 되는 답변을 한국어로 작성해주세요: "${selectedQuestion.text}"`;
      let chatHistory = [];
      chatHistory.push({ role: "user", parts: [{ text: prompt }] });

      const payload = { contents: chatHistory };
      const apiKey = ""; // Canvas 환경에서는 자동으로 제공됩니다. 로컬에서는 필요 없지만, API 호출을 위해 빈 문자열로 둡니다.
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`API 오류: ${response.status} - ${errorData.error?.message || '알 수 없는 오류'}`);
      }

      const result = await response.json();

      if (result.candidates && result.candidates.length > 0 &&
          result.candidates[0].content && result.candidates[0].content.parts &&
          result.candidates[0].content.parts.length > 0) {
        const generatedText = result.candidates[0].content.parts[0].text;
        setNewAnswerText(generatedText);
      } else {
        openModal({ type: 'message', message: "답변 초안을 생성할 수 없습니다. 응답 구조가 예상과 다릅니다." });
      }
    } catch (error) {
      console.error("답변 초안 생성 중 오류:", error);
      openModal({ type: 'message', message: `답변 초안 생성 중 오류가 발생했습니다: ${error.message}` });
    } finally {
      setIsGeneratingAnswer(false);
    }
  }, [selectedQuestion, openModal]);

  const handleSelectQuestion = useCallback((question) => {
    setSelectedQuestion({ ...question, answers: [] });
    setNewAnswerText('');
    setEditingAnswer(null);
  }, []);

  return (
      <div className="min-h-screen bg-gray-100 flex flex-col items-center p-4 font-sans">
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />

        {/* style 태그에서 불필요한 jsx 및 global 속성 제거 */}
        <style>{`
                body {
                    font-family: 'Inter', sans-serif;
                }
            `}</style>

        {!isAuthReady && (
            <div className="fixed inset-0 bg-gray-100 flex items-center justify-center z-40">
              <p className="text-center text-gray-700 text-2xl font-bold">애플리케이션 로딩 중...</p>
            </div>
        )}

        <Modal
            show={showModal}
            type={modalConfig.type}
            message={modalConfig.message}
            onConfirm={modalConfig.onConfirm}
            onClose={closeModal}
        >
          {modalConfig.children}
        </Modal>

        <div className="w-full max-w-4xl bg-white rounded-lg shadow-md p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-4 text-center">질문 및 답변 포럼</h1>

          <div className="mb-6 text-center">
            {isAuthReady ? (
                user ? (
                    <>
                      <p className="text-gray-600 mb-2">
                        로그인됨: <span className="font-semibold text-blue-700">{user.displayName || user.email}</span>
                      </p>
                      <button
                          onClick={handleSignOut}
                          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out shadow-lg"
                      >
                        로그아웃
                      </button>
                    </>
                ) : (
                    <button
                        onClick={handleGoogleSignIn}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out shadow-lg flex items-center justify-center mx-auto"
                    >
                      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12.24 10.232v3.743h6.467c-.255 1.564-1.077 2.87-2.348 3.738-1.258.859-2.859 1.347-4.542 1.347-3.488 0-6.326-2.838-6.326-6.326s2.838-6.326 6.326-6.326c1.884 0 3.39 1.054 4.195 1.836l2.607-2.607c-1.543-1.442-3.626-2.316-6.802-2.316-4.996 0-9.043 4.047-9.043 9.043s4.047 9.043 9.043 9.043c4.996 0 8.784-3.791 8.784-8.868 0-.6-.057-1.18-.168-1.748h-8.616z" />
                      </svg>
                      구글로 로그인
                    </button>
                )
            ) : (
                <p className="text-gray-500">인증 로딩 중...</p>
            )}
          </div>

          {/* 새 질문 작성 섹션 */}
          {user ? (
              <div className="mb-6 border-b pb-4">
                <h2 className="text-xl font-semibold text-gray-700 mb-3">새 질문 작성</h2>
                <textarea
                    className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3 resize-y"
                    rows="4"
                    placeholder="여기에 질문을 입력하세요..."
                    value={newQuestionText}
                    onChange={(e) => setNewQuestionText(e.target.value)}
                ></textarea>
                <button
                    onClick={handlePostQuestion}
                    className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-md transition duration-300 ease-in-out shadow-lg"
                >
                  질문 게시
                </button>
              </div>
          ) : (
              <div className="text-center p-6 bg-gray-50 rounded-lg shadow-inner mb-6">
                <p className="text-lg text-gray-700">질문을 게시하려면 구글 로그인이 필요합니다.</p>
              </div>
          )}

          {/* 질문 목록 섹션 */}
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-700 mb-3">모든 질문</h2>
            {questions.length === 0 ? (
                <p className="text-gray-500 text-center">아직 질문이 없습니다. 첫 질문을 게시해보세요!</p>
            ) : (
                <div className="space-y-4">
                  {questions.map((question) => (
                      <div
                          key={question.id}
                          className={`p-4 border border-gray-200 rounded-md cursor-pointer transition duration-200 ease-in-out
                                        ${selectedQuestion?.id === question.id ? 'bg-blue-50 border-blue-400 shadow-md' : 'bg-gray-50 hover:bg-gray-100'}`}
                          onClick={() => handleSelectQuestion(question)}
                      >
                        <p className="font-medium text-gray-800 text-lg mb-1">{question.text}</p>
                        <p className="text-sm text-gray-500">
                          작성자: <span className="font-semibold">{question.userName || '알 수 없음'}</span> (<span className="font-mono">{question.userId}</span>)
                          {question.timestamp && (
                              <> | {new Date(question.timestamp.toDate()).toLocaleString()}</>
                          )}
                        </p>
                        <p className="text-sm text-gray-600 mt-2">
                          답변 수: {question.answers ? question.answers.length : 0}
                        </p>
                        {user && user.uid === question.userId && (
                            <div className="mt-3 flex space-x-2 justify-end">
                              <button
                                  onClick={(e) => { e.stopPropagation(); handleEditQuestion(question); }}
                                  className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 ease-in-out"
                              >
                                수정
                              </button>
                              <button
                                  onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(question.id); }}
                                  className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 ease-in-out"
                              >
                                삭제
                              </button>
                            </div>
                        )}
                      </div>
                  ))}
                </div>
            )}
          </div>

          {/* 선택된 질문 및 답변 섹션 */}
          {selectedQuestion && (
              <div className="border-t pt-6 mt-6">
                <h2 className="text-2xl font-bold text-gray-800 mb-4">선택된 질문</h2>
                <div className="bg-blue-100 p-5 rounded-lg shadow-inner mb-6">
                  <p className="text-xl font-semibold text-blue-800 mb-2">{selectedQuestion.text}</p>
                  <p className="text-sm text-blue-600">
                    작성자: <span className="font-semibold">{selectedQuestion.userName || '알 수 없음'}</span> (<span className="font-mono">{selectedQuestion.userId}</span>)
                    {selectedQuestion.timestamp && (
                        <> | {new Date(selectedQuestion.timestamp.toDate()).toLocaleString()}</>
                    )}
                  </p>
                </div>

                {/* 답변 목록 섹션 */}
                <h3 className="text-xl font-semibold text-gray-700 mb-3">답변</h3>
                {selectedQuestion.answers && selectedQuestion.answers.length > 0 ? (
                    <div className="space-y-3 mb-6">
                      {selectedQuestion.answers.map((answer) => (
                          <div key={answer.id} className="bg-gray-50 p-3 border border-gray-200 rounded-md">
                            {editingAnswer?.id === answer.id ? (
                                <div className="flex flex-col">
                                                <textarea
                                                    className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300 mb-2 resize-y text-sm"
                                                    rows="2"
                                                    value={editingAnswer.text || ''}
                                                    onChange={(e) => setEditingAnswer(prev => ({ ...prev, text: e.target.value }))}
                                                ></textarea>
                                  <div className="flex space-x-2 justify-end">
                                    <button
                                        onClick={handleUpdateAnswer}
                                        className="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 ease-in-out"
                                    >
                                      저장
                                    </button>
                                    <button
                                        onClick={() => { setEditingAnswer(null); }}
                                        className="bg-gray-300 hover:bg-gray-400 text-gray-800 text-xs font-bold py-1 px-2 rounded-md transition duration-300 ease-in-out"
                                    >
                                      취소
                                    </button>
                                  </div>
                                </div>
                            ) : (
                                <>
                                  <p className="text-gray-800 mb-1">{answer.text}</p>
                                  <p className="text-xs text-gray-500">
                                    작성자: <span className="font-semibold">{answer.userName || '알 수 없음'}</span> (<span className="font-mono">{answer.userId}</span>)
                                    {answer.timestamp && (
                                        <> | {new Date(answer.timestamp.toDate()).toLocaleString()}</>
                                    )}
                                  </p>
                                  {user && user.uid === answer.userId && (
                                      <div className="mt-2 flex space-x-2 justify-end">
                                        <button
                                            onClick={() => handleEditAnswer(answer)}
                                            className="bg-yellow-500 hover:bg-yellow-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 ease-in-out"
                                            disabled={isGeneratingAnswer.toString()} // 불리언 값을 문자열로 변환
                                        >
                                          수정
                                        </button>
                                        <button
                                            onClick={() => handleDeleteAnswer(answer.id)}
                                            className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold py-1 px-2 rounded-md transition duration-300 ease-in-out"
                                            disabled={isGeneratingAnswer.toString()} // 불리언 값을 문자열로 변환
                                        >
                                          삭제
                                        </button>
                                      </div>
                                  )}
                                </>
                            )}
                          </div>
                      ))}
                    </div>
                ) : (
                    <p className="text-gray-500 mb-6 text-center">아직 답변이 없습니다. 첫 답변을 달아보세요!</p>
                )}

                {/* 새 답변 작성 섹션 */}
                {user ? (
                    <div className="border-t pt-4">
                      <h3 className="text-xl font-semibold text-gray-700 mb-3">답변 작성</h3>
                      <textarea
                          className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400 mb-3 resize-y"
                          rows="3"
                          placeholder={isGeneratingAnswer ? "답변 초안 생성 중..." : "여기에 답변을 입력하세요..."}
                          value={newAnswerText}
                          onChange={(e) => setNewAnswerText(e.target.value)}
                          disabled={isGeneratingAnswer.toString()} // 불리언 값을 문자열로 변환
                      ></textarea>
                      <div className="flex space-x-2 mt-2">
                        <button
                            onClick={handlePostAnswer}
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-md transition duration-300 ease-in-out shadow-lg"
                            disabled={isGeneratingAnswer.toString()} // 불리언 값을 문자열로 변환
                        >
                          답변 게시
                        </button>
                        <button
                            onClick={handleGenerateAnswerDraft}
                            className="flex-1 bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-md transition duration-300 ease-in-out shadow-lg flex items-center justify-center"
                            disabled={(isGeneratingAnswer || !selectedQuestion).toString()} // 불리언 값을 문자열로 변환
                        >
                          {isGeneratingAnswer ? (
                              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                          ) : (
                              '✨ 답변 초안 생성'
                          )}
                        </button>
                      </div>
                    </div>
                ) : (
                    <div className="text-center p-6 bg-gray-50 rounded-lg shadow-inner mt-6">
                      <p className="text-lg text-gray-700">답변을 게시하려면 구글 로그인이 필요합니다.</p>
                    </div>
                )}
              </div>
          )}
        </div>
      </div>
  );
};

export default App;
