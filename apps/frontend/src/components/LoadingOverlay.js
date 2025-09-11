import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export default function LoadingOverlay({ isVisible, title }) {
    if (!isVisible)
        return null;
    return (_jsx("div", { style: {
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'grid', placeItems: 'center', zIndex: 999
        }, children: _jsxs("div", { style: { color: 'white', textAlign: 'center' }, children: [_jsx("h2", { style: { fontSize: '1.5rem' }, children: title }), _jsx("p", { children: "Please wait..." })] }) }));
}
