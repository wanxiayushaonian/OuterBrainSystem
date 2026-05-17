"""Agent system for multi-agent canvas operations."""
from src.agents.base_agent import BaseAgent
from src.agents.distillation_agent import DistillationAgent
from src.agents.socratic_agent import SocraticAgent
from src.agents.flow_analyzer_agent import FlowAnalyzerAgent
from src.agents.conclusion_agent import ConclusionAgent
from src.agents.relation_discoverer import RelationDiscovererAgent
from src.agents.cognitive_debate_agent import CognitiveDebateAgent
from src.agents.research_path_agent import ResearchPathAgent
from src.agents.knowledge_graph_agent import KnowledgeGraphAgent

__all__ = [
    "BaseAgent",
    "DistillationAgent",
    "SocraticAgent",
    "FlowAnalyzerAgent",
    "ConclusionAgent",
    "RelationDiscovererAgent",
    "CognitiveDebateAgent",
    "ResearchPathAgent",
    "KnowledgeGraphAgent",
]
