"""PyTorch port of the multi-tower multitask network (multitower_v1).

Faithful port of the pure-NumPy v0 (ml/multitower/model.py):

    per-domain tower:  x_domain -> ReLU MLP [d, 32, 32] -> z_domain
    shared trunk:      concat(z) -> ReLU MLP [32*n_towers, 64, 64] -> h
    task heads:        h -> Linear(64, 1)   (one head per task)

Init matches v0: He (kaiming fan_in) normal for MLP layers, N(0, 1/fan_in)
for the heads, zero biases. Draws differ numerically from v0 (torch vs
numpy RNG) but come from the same distributions.

Tasks: regression (standardized MSE), binary classification (BCE w/ logits),
count (MSE on log1p-standardized target). Multitask loss = sum of per-task
losses weighted by tasks.json weights.
"""
import torch
import torch.nn as nn


def _mlp(dims):
    """ReLU MLP with He init, matching v0's MLP (final_relu=True)."""
    layers = []
    for d_in, d_out in zip(dims[:-1], dims[1:]):
        lin = nn.Linear(d_in, d_out)
        nn.init.kaiming_normal_(lin.weight, mode="fan_in",
                                nonlinearity="relu")
        nn.init.zeros_(lin.bias)
        layers += [lin, nn.ReLU()]
    return nn.Sequential(*layers)


class MultiTowerTorch(nn.Module):
    def __init__(self, tower_dims: dict, tower_h=32, trunk_h=64,
                 tasks=("gas_fwd7",), seed=7):
        super().__init__()
        torch.manual_seed(seed)
        self.tower_names = list(tower_dims)
        self.towers = nn.ModuleDict(
            {n: _mlp([d, tower_h, tower_h]) for n, d in tower_dims.items()})
        self.trunk = _mlp([tower_h * len(tower_dims), trunk_h, trunk_h])
        self.heads = nn.ModuleDict()
        for t in tasks:
            head = nn.Linear(trunk_h, 1)
            nn.init.normal_(head.weight, 0.0, (1.0 / trunk_h) ** 0.5)
            nn.init.zeros_(head.bias)
            self.heads[t] = head

    def forward(self, xs: dict):
        zs = [self.towers[n](xs[n]) for n in self.tower_names]
        h = self.trunk(torch.cat(zs, dim=1))
        return {t: self.heads[t](h).squeeze(-1) for t in self.heads}
