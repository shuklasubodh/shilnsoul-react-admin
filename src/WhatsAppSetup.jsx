import { useEffect, useState } from "react";

export default function WhatsAppSetup() {
  const [signupResult, setSignupResult] = useState(null);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.origin !== "https://www.facebook.com") return;

      try {
        const message =
          typeof event.data === "string" ? JSON.parse(event.data) : event.data;

        if (message?.type !== "WA_EMBEDDED_SIGNUP") return;

        if (message.event === "FINISH") {
          const result = {
            phoneNumberId: message.data?.phone_number_id,
            accountId:
              message.data?.waba_id ??
              message.data?.whatsapp_business_account_id,
            businessId: message.data?.business_id,
          };

          setSignupResult(result);
        }

        if (message.event === "CANCEL") {
          setSignupResult({
            cancelled: true,
            currentStep: message.data?.current_step,
          });
        }

        if (message.event === "ERROR") {
          setSignupResult({
            error: message.data?.error_message ?? "Embedded Signup failed",
          });
        }
      } catch {
        // Ignore unrelated non-JSON Facebook SDK messages.
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <section>
      {/* Embedded Signup button will go here next. */}

      {signupResult && <pre>{JSON.stringify(signupResult, null, 2)}</pre>}
    </section>
  );
}
