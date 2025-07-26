export const validateResponse = (answer: string): string => {
  const trimmed = answer.trim();
  
  if (trimmed.length < 10) {
    return "Please provide a thoughtful response (minimum 10 characters)";
  }
  
  if (/^\d+$/.test(trimmed)) {
    return "Please provide a thoughtful response, not just numbers";
  }
  
  if (/^[^a-zA-Z]*$/.test(trimmed)) {
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
