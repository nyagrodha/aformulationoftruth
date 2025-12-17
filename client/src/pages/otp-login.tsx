import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from "@/components/ui/input-otp";

type OTPChannel = "sms" | "whatsapp" | "email";
type OTPStatus = "idle" | "sending" | "sent" | "verifying" | "verified" | "error";

const channelLabels: Record<OTPChannel, string> = {
  sms: "SMS Text",
  whatsapp: "WhatsApp",
  email: "Email",
};

const channelIcons: Record<OTPChannel, string> = {
  sms: "📱",
  whatsapp: "💬",
  email: "📧",
};

export default function OTPLoginPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const [channel, setChannel] = useState<OTPChannel>("sms");
  const [destination, setDestination] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [status, setStatus] = useState<OTPStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      setLocation("/");
    }
  }, [isAuthenticated, setLocation]);

  const handleSendOTP = async (event: FormEvent) => {
    event.preventDefault();

    if (!destination) {
      setErrorMessage(
        channel === "email"
          ? "Please enter your email address."
          : "Please enter your phone number."
      );
      return;
    }

    setStatus("sending");
    setErrorMessage(null);
    setInfoMessage(null);

    try {
      const response = await fetch("/auth/otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: destination, channel }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Failed to send verification code");
      }

      setStatus("sent");
      setInfoMessage(`Verification code sent via ${channelLabels[channel]}. Check your ${channel === "email" ? "inbox" : "messages"}.`);
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "Failed to send verification code";
      setErrorMessage(message);
    }
  };

  const handleVerifyOTP = useCallback(async () => {
    if (otpCode.length < 6) {
      return;
    }

    setStatus("verifying");
    setErrorMessage(null);

    try {
      const response = await fetch("/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ to: destination, code: otpCode }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error || "Invalid verification code");
      }

      setStatus("verified");
      setInfoMessage("Verification successful! Redirecting...");

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });

      setTimeout(() => {
        setLocation("/auth-callback");
      }, 800);
    } catch (error) {
      setStatus("error");
      const message = error instanceof Error ? error.message : "Failed to verify code";
      setErrorMessage(message);
      setOtpCode("");
    }
  }, [otpCode, destination, queryClient, setLocation]);

  useEffect(() => {
    if (otpCode.length === 6 && status === "sent") {
      handleVerifyOTP();
    }
  }, [otpCode, status, handleVerifyOTP]);

  const handleResend = () => {
    setOtpCode("");
    setStatus("idle");
    setInfoMessage(null);
    setErrorMessage(null);
  };

  const handleChangeDestination = () => {
    setDestination("");
    setOtpCode("");
    setStatus("idle");
    setInfoMessage(null);
    setErrorMessage(null);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-hidden flex items-center justify-center neon-background"
      style={{
        background: `
          radial-gradient(circle at 20% 20%, rgba(0, 255, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(255, 0, 255, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 40% 60%, rgba(148, 0, 211, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 70% 30%, rgba(0, 255, 255, 0.05) 0%, transparent 60%),
          #8B4513
        `,
      }}
    >
      <div
        className="relative px-12 py-8 neon-frame max-w-lg w-full mx-4"
        style={{
          background: "rgba(212, 175, 55, 0.8)",
          border: "12px solid #8B4513",
          borderRadius: "16px",
          boxShadow: `
            0 0 20px #00ffff,
            inset 0 0 15px #ff00ff,
            0 0 30px #9400d3
          `,
        }}
      >
        <div className="text-center mb-6">
          <span
            className="block lowercase text-3xl"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: "#111",
              textShadow: `
                0 0 8px #00ffff,
                0 0 12px #ff00ff,
                0 0 4px rgba(0, 255, 255, 0.8),
                0 0 8px rgba(255, 0, 255, 0.8)
              `,
            }}
          >
            verify your identity
          </span>
          <p
            className="text-sm mt-2"
            style={{
              fontFamily: '"Playfair Display", serif',
              color: "#2d1810",
            }}
          >
            Choose how to receive your verification code
          </p>
        </div>

        {status === "idle" || status === "sending" || status === "error" ? (
          <form onSubmit={handleSendOTP} className="space-y-6">
            {/* Channel Selection */}
            <div className="space-y-2">
              <label
                className="block text-sm font-medium"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  color: "#2d1810",
                }}
              >
                Delivery Method
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["sms", "whatsapp", "email"] as OTPChannel[]).map((ch) => (
                  <button
                    key={ch}
                    type="button"
                    onClick={() => {
                      setChannel(ch);
                      setDestination("");
                      setErrorMessage(null);
                    }}
                    className={`py-3 px-2 rounded-lg text-center transition-all duration-200 ${
                      channel === ch
                        ? "ring-2 ring-cyan-400 ring-offset-2"
                        : "hover:bg-white/30"
                    }`}
                    style={{
                      background: channel === ch ? "rgba(0,255,255,0.3)" : "rgba(255,255,255,0.2)",
                      border: "1px solid rgba(139, 69, 19, 0.4)",
                    }}
                  >
                    <span className="block text-xl mb-1">{channelIcons[ch]}</span>
                    <span
                      className="text-xs"
                      style={{
                        fontFamily: '"Playfair Display", serif',
                        color: "#2d1810",
                      }}
                    >
                      {channelLabels[ch]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Destination Input */}
            <div className="space-y-2">
              <label
                className="block text-sm font-medium"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  color: "#2d1810",
                }}
              >
                {channel === "email" ? "Email Address" : "Phone Number"}
              </label>
              <input
                type={channel === "email" ? "email" : "tel"}
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-[#8B4513]/40 focus:outline-none focus:ring-2 focus:ring-cyan-400 bg-white/80 text-[#2d1810]"
                placeholder={
                  channel === "email"
                    ? "you@example.com"
                    : "+1 555 123 4567"
                }
                required
                disabled={status === "sending"}
              />
              {channel !== "email" && (
                <p className="text-xs text-[#4d2316]" style={{ fontFamily: '"Playfair Display", serif' }}>
                  Include country code (e.g., +1 for US)
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full py-3 rounded-full text-xl font-semibold transition-all duration-300"
              style={{
                background: "linear-gradient(45deg, rgba(0,255,255,0.6), rgba(255,0,255,0.6))",
                color: "#111",
                textShadow: "0 0 6px rgba(0,0,0,0.2)",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
                opacity: status === "sending" ? 0.7 : 1,
              }}
              disabled={status === "sending"}
            >
              {status === "sending" ? "Sending code..." : "Send Verification Code"}
            </button>

            {errorMessage && (
              <p
                className="text-center text-red-800"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                {errorMessage}
              </p>
            )}

            {/* Alternative auth options */}
            <div className="text-center pt-4 border-t border-[#8B4513]/20">
              <button
                type="button"
                onClick={() => setLocation("/")}
                className="text-sm text-[#4d2316] hover:text-[#2d1810] transition-colors"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                ← Use magic link instead
              </button>
            </div>
          </form>
        ) : (
          /* OTP Entry Form */
          <div className="space-y-6">
            <div className="text-center">
              <p
                className="text-sm mb-4"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  color: "#2d1810",
                }}
              >
                Enter the 6-digit code sent to
              </p>
              <p
                className="font-medium text-lg"
                style={{
                  fontFamily: '"Playfair Display", serif',
                  color: "#111",
                }}
              >
                {destination}
              </p>
            </div>

            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={otpCode}
                onChange={(value) => setOtpCode(value)}
                disabled={status === "verifying" || status === "verified"}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="bg-white/80 border-[#8B4513]/40" />
                  <InputOTPSlot index={1} className="bg-white/80 border-[#8B4513]/40" />
                  <InputOTPSlot index={2} className="bg-white/80 border-[#8B4513]/40" />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup>
                  <InputOTPSlot index={3} className="bg-white/80 border-[#8B4513]/40" />
                  <InputOTPSlot index={4} className="bg-white/80 border-[#8B4513]/40" />
                  <InputOTPSlot index={5} className="bg-white/80 border-[#8B4513]/40" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {status === "verifying" && (
              <div className="flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400"></div>
              </div>
            )}

            {infoMessage && (
              <p
                className="text-center text-[#2d1810]"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                {infoMessage}
              </p>
            )}

            {errorMessage && (
              <p
                className="text-center text-red-800"
                style={{ fontFamily: '"Playfair Display", serif' }}
              >
                {errorMessage}
              </p>
            )}

            <div className="flex justify-between text-sm pt-4 border-t border-[#8B4513]/20">
              <button
                type="button"
                onClick={handleResend}
                className="text-[#4d2316] hover:text-[#2d1810] transition-colors"
                style={{ fontFamily: '"Playfair Display", serif' }}
                disabled={status === "verifying"}
              >
                Resend code
              </button>
              <button
                type="button"
                onClick={handleChangeDestination}
                className="text-[#4d2316] hover:text-[#2d1810] transition-colors"
                style={{ fontFamily: '"Playfair Display", serif' }}
                disabled={status === "verifying"}
              >
                Change {channel === "email" ? "email" : "number"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
