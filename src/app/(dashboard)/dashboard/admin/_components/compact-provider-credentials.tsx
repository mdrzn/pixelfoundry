"use client";

import { useState } from "react";
import { ProviderCredential, Provider } from "@prisma/client";

import { ProviderCredentialCard } from "./provider-card";

type CompactProviderCredentialsProps = {
  providers: Provider[];
  credentialMap: Map<Provider, ProviderCredential | undefined>;
};

export function CompactProviderCredentials({
  providers,
  credentialMap,
}: CompactProviderCredentialsProps) {
  const [expandedProvider, setExpandedProvider] = useState<Provider | null>(null);

  const toggleProvider = (provider: Provider) => {
    setExpandedProvider((current) => (current === provider ? null : provider));
  };

  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
      {providers.map((provider) => (
        <ProviderCredentialCard
          key={provider}
          provider={provider}
          credential={credentialMap.get(provider)}
          isExpanded={expandedProvider === provider}
          onToggle={() => toggleProvider(provider)}
        />
      ))}
    </div>
  );
}
