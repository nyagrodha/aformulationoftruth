export const validateResponse = (answer: string): string => {
  const trimmed = answer.trim();
  
  if (trimmed.length < 10) {
    return "Please provide a thoughtful response (minimum 10 characters)";
  }
  
  if (/^\d+$/.test(trimmed)) {
    return "Please provide a thoughtful response, not just numbers";
  }
  
  // Check if response contains at least some letters from any language
  // This allows Latin, Cyrillic, Arabic, Chinese, Japanese, Korean, and other scripts
  if (!/[a-zA-ZÀ-ÿĀ-žА-я\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF\u0400-\u04FF\u0500-\u052F\u2DE0-\u2DFF\uA640-\uA69F\u0370-\u03FF\u1F00-\u1FFF\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u4E00-\u9FFF\u3400-\u4DBF\u20000-\u2A6DF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]/.test(trimmed)) {
    return "Response must contain meaningful text";
  }
  
  if (/^[!@#$%^&*()_+\-=\[\]{}|;':"\\|,.<>\/?]*$/.test(trimmed)) {
    return "Response cannot consist entirely of special characters";
  }
  
  return "";
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};
