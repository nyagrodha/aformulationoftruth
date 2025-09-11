import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
export default function QuestionCard({ question, questionNumber, answer, onAnswerChange, onNext, onPrevious }) {
    return (_jsxs("div", { style: { padding: '2rem', border: '1px solid white', borderRadius: '8px', color: 'white' }, children: [_jsxs("h3", { children: ["Question ", questionNumber] }), _jsx("p", { children: question.text }), _jsx("textarea", { value: answer, onChange: (e) => onAnswerChange(e.target.value), rows: 5, style: { width: '100%', color: 'black' } }), _jsxs("div", { style: { marginTop: '1rem' }, children: [_jsx("button", { onClick: onPrevious, children: "Previous" }), _jsx("button", { onClick: onNext, style: { marginLeft: '1rem' }, children: "Next" })] })] }));
}
