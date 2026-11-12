let otpExpirationTimer;
let otpResendTimer;

window.startOtpTimers = function startOtpTimers(expiresInSeconds, resendAfterSeconds) {
  const countdown = document.getElementById('otpCountdown');
  const resendButton = document.getElementById('resendButton');
  let expirationRemaining = Number(expiresInSeconds) || 300;
  let resendRemaining = Number(resendAfterSeconds) || 60;
  const originalResendLabel = resendButton.dataset.originalLabel || resendButton.textContent;
  resendButton.dataset.originalLabel = originalResendLabel;

  clearInterval(otpExpirationTimer);
  clearInterval(otpResendTimer);

  const renderExpiration = () => {
    const minutes = Math.floor(expirationRemaining / 60);
    const seconds = String(expirationRemaining % 60).padStart(2, '0');
    countdown.textContent =
      expirationRemaining > 0
        ? `Code expires in ${minutes}:${seconds}.`
        : 'This code has expired. Request a new code.';
  };

  const renderResend = () => {
    if (resendRemaining <= 0) {
      resendButton.disabled = false;
      resendButton.textContent = originalResendLabel;
      clearInterval(otpResendTimer);
      return;
    }
    resendButton.disabled = true;
    resendButton.textContent = `Resend code in ${resendRemaining}s`;
  };

  renderExpiration();
  renderResend();
  otpExpirationTimer = setInterval(() => {
    expirationRemaining = Math.max(0, expirationRemaining - 1);
    renderExpiration();
    if (expirationRemaining === 0) clearInterval(otpExpirationTimer);
  }, 1000);
  otpResendTimer = setInterval(() => {
    resendRemaining = Math.max(0, resendRemaining - 1);
    renderResend();
  }, 1000);
};
